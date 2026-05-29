"""Live monitor REST API (ADR 0004 §9). Read-only by default; stop-loss is the
only write path and is double-gated (live_trading_enabled + confirm=true)."""

from __future__ import annotations

import time
from decimal import Decimal
from typing import Any, cast

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import text

from app.api.timeseries import read_timeseries
from app.core.config import settings
from app.db.session import get_sessionmaker
from app.services.delta_rest import DeltaRestClient
from app.services.live import sl_monitor
from app.services.live.auth_gate import AuthGateError, RateLimitError, require_auth
from app.services.live.mtm import aggregate
from app.services.live.order_sync import ORDERS_INDEX
from app.services.live.position_sync import POSITIONS_INDEX
from app.services.live.strategy_grouper import (
    PositionAlreadyTaggedError,
    create_strategy,
    list_strategies,
    strategy_symbols,
)
from app.services.quant.rv import historical_rv, intraday_rv
from app.services.redis_bus import get_bus

router = APIRouter(prefix="/live", tags=["live"])
UNDERLYING_FUTURE = "BTCUSD"


def _gate(*, order_placing: bool = False, confirm: bool | None = None) -> None:
    """Run the auth gate; translate AuthGateError -> HTTPException (503/403/422/429)."""
    try:
        require_auth(order_placing=order_placing, confirm=confirm)
    except RateLimitError as exc:
        raise HTTPException(
            status_code=429,
            detail={"error": exc.error, "msg": exc.message},
            headers={"Retry-After": str(round(exc.retry_after, 3))},
        ) from exc
    except AuthGateError as exc:
        raise HTTPException(
            status_code=exc.status_code, detail={"error": exc.error, "msg": exc.message}
        ) from exc


class StrategyReq(BaseModel):
    name: str
    position_ids: list[str]  # symbols


class StopLossReq(BaseModel):
    threshold_abs: Decimal | None = None
    threshold_pct: Decimal | None = None
    confirm: bool = False


@router.get("/positions")
async def positions() -> dict[str, Any]:
    _gate()
    bus = get_bus()
    symbols = sorted(await bus.smembers(POSITIONS_INDEX))
    rows = [snap for s in symbols if (snap := await bus.get_latest(f"live:position:{s}"))]
    return {"positions": rows}


@router.get("/orders")
async def orders() -> dict[str, Any]:
    _gate()
    bus = get_bus()
    ids = sorted(await bus.smembers(ORDERS_INDEX))
    rows = [snap for i in ids if (snap := await bus.get_latest(f"live:order:{i}"))]
    return {"orders": rows}


@router.post("/strategies")
async def post_strategy(req: StrategyReq) -> dict[str, Any]:
    _gate()
    try:
        sid = await create_strategy(req.name, req.position_ids)
    except PositionAlreadyTaggedError as exc:
        raise HTTPException(
            status_code=409, detail={"error": "already_tagged", "msg": str(exc)}
        ) from exc
    return {"strategy_id": sid}


@router.get("/strategies")
async def get_strategies() -> dict[str, Any]:
    _gate()
    bus = get_bus()
    out = []
    for strat in await list_strategies():
        symbols = [str(s) for s in cast("list[str]", strat["symbols"])]
        agg = await aggregate(symbols, bus=bus)
        sl = await bus.get_latest(f"live:sl:{strat['id']}")
        out.append(
            {
                **strat,
                "aggregate": {
                    "total_pnl": agg.total_pnl,
                    "unrealized_pnl": agg.unrealized_pnl,
                    "net_delta": agg.net_delta,
                    "net_gamma": agg.net_gamma,
                    "net_theta": agg.net_theta,
                    "net_vega": agg.net_vega,
                    "strategy_iv": agg.strategy_iv,
                    "margin": agg.margin,
                    "mark_stale": agg.mark_stale,
                },
                "sl_state": sl.get("state") if sl else None,
            }
        )
    return {"strategies": out}


@router.get("/strategies/{strategy_id}/mtm")
async def strategy_mtm(strategy_id: int, history: bool = Query(False)) -> dict[str, Any]:
    _gate()
    bus = get_bus()
    symbols = await strategy_symbols(strategy_id)
    agg = await aggregate(symbols, bus=bus)
    out: dict[str, Any] = {
        "strategy_id": strategy_id,
        "aggregate": agg.__dict__,
        "rv": await _underlying_rv(),
        "sl_state": (await bus.get_latest(f"live:sl:{strategy_id}")).get("state"),
    }
    if history:
        out["curve"] = await _mtm_history(strategy_id)
    return out


@router.get("/strategies/{strategy_id}/timeseries")
async def strategy_timeseries(
    strategy_id: int,
    fields: str = Query("close,delta,gamma,theta,vega,iv,rv_intraday,rv_historical"),
    from_: str | None = Query(None, alias="from"),
    to: str | None = Query(None),
) -> dict[str, Any]:
    _gate()
    return await read_timeseries(
        "live_mtm_minute", "strategy_id", strategy_id, fields, from_=from_, to=to
    )


@router.post("/strategies/{strategy_id}/stop-loss")
async def set_stop_loss(strategy_id: int, req: StopLossReq) -> dict[str, Any]:
    # Full double-gate: arming a real-money SL needs live trading on + confirm.
    _gate(order_placing=True, confirm=req.confirm)
    if req.threshold_abs is None and req.threshold_pct is None:
        raise HTTPException(
            status_code=422, detail={"error": "threshold_required", "msg": "set abs or pct"}
        )
    await sl_monitor.arm(
        strategy_id, threshold_abs=req.threshold_abs, threshold_pct=req.threshold_pct, bus=get_bus()
    )
    return {"strategy_id": strategy_id, "sl_state": "ARMED"}


@router.delete("/strategies/{strategy_id}/stop-loss")
async def clear_stop_loss(strategy_id: int) -> dict[str, Any]:
    # Disarming REMOVES an automated order path -> only needs keys present (no
    # confirm/live gate), so a misbehaving SL can always be killed quickly.
    _gate()
    disarmed = await sl_monitor.disarm(strategy_id, bus=get_bus())
    if not disarmed:
        raise HTTPException(
            status_code=409, detail={"error": "not_armed", "msg": "SL is not ARMED"}
        )
    return {"strategy_id": strategy_id, "sl_state": "DISARMED"}


async def _underlying_rv() -> dict[str, str | None]:
    intraday: Decimal | None = None
    historical: Decimal | None = None
    sessionmaker = get_sessionmaker()
    try:
        async with sessionmaker() as session:
            rows = (
                await session.execute(
                    text(
                        "SELECT close FROM ticks_minute WHERE symbol = :sym "
                        "AND ts > NOW() - (:win || ' minutes')::interval ORDER BY ts"
                    ),
                    {"sym": UNDERLYING_FUTURE, "win": settings.rv_intraday_window_minutes},
                )
            ).all()
        intraday = intraday_rv([Decimal(str(r[0])) for r in rows if r[0] is not None])
    except Exception:
        intraday = None
    # Historical RV from Delta daily candles (public endpoint, no keys) — parity
    # with the paper path so the live RV card isn't permanently blank.
    rest = DeltaRestClient()
    try:
        now = int(time.time())
        start = now - settings.rv_historical_window_days * 86400
        candles = await rest.get_candles(UNDERLYING_FUTURE, "1d", start, now)
        closes = [Decimal(str(c["close"])) for c in candles if c.get("close") is not None]
        historical = historical_rv(closes)
    except Exception:
        historical = None
    finally:
        await rest.aclose()
    return {
        "intraday": None if intraday is None else str(intraday),
        "historical": None if historical is None else str(historical),
        "window_minutes": str(settings.rv_intraday_window_minutes),
        "window_days": str(settings.rv_historical_window_days),
    }


async def _mtm_history(strategy_id: int) -> list[dict[str, Any]]:
    sessionmaker = get_sessionmaker()
    async with sessionmaker() as session:
        rows = (
            await session.execute(
                text(
                    "SELECT ts, close, unrealized_pnl, net_delta, net_theta, strategy_iv "
                    "FROM live_mtm_minute WHERE strategy_id = :sid ORDER BY ts"
                ),
                {"sid": strategy_id},
            )
        ).all()
    return [
        {
            "ts": r[0],
            "total_pnl": r[1],
            "unrealized_pnl": r[2],
            "net_delta": r[3],
            "net_theta": r[4],
            "strategy_iv": r[5],
        }
        for r in rows
    ]
