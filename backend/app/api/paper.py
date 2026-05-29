"""Paper-trade REST API (ADR 0003 §10). All money is Decimal-as-strings."""

from __future__ import annotations

import time
from collections.abc import AsyncIterator, Sequence
from decimal import Decimal
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select, text

from app.api.timeseries import read_timeseries
from app.core.config import settings
from app.core.logging import logger
from app.db.session import get_sessionmaker
from app.models.paper import PaperLeg, PaperPosition, Strategy
from app.services.delta_rest import DeltaRestClient
from app.services.paper.engine import PaperEngine
from app.services.paper.models import StrategySpec
from app.services.quant.rv import historical_rv, intraday_rv
from app.services.quant.slippage import InsufficientDepthError
from app.services.redis_bus import get_bus

router = APIRouter(prefix="/paper", tags=["paper"])

UNDERLYING_FUTURE = "BTCUSD"


async def get_engine() -> AsyncIterator[PaperEngine]:
    rest = DeltaRestClient()
    try:
        yield PaperEngine(rest=rest, bus=get_bus())
    finally:
        await rest.aclose()


class ExecuteRequest(BaseModel):
    strategy_id: int | None = None
    spec: StrategySpec | None = None


class CloseLegReq(BaseModel):
    leg_id: int
    qty: Decimal


class CloseRequest(BaseModel):
    legs: list[CloseLegReq] | None = None


def _exec_result_payload(result: Any) -> dict[str, Any]:
    return {
        "entry_cost": result.entry_cost,
        "margin_estimate": result.margin_estimate,
        "legs": [
            {
                "symbol": lf.symbol,
                "side": lf.side,
                "qty": lf.qty,
                "contract_size": lf.contract_size,
                "vwap": lf.fill.vwap,
                "impact": lf.fill.impact,
                "entry_fill": lf.fill.fill_price,
            }
            for lf in result.legs
        ],
    }


@router.get("/strategies")
async def list_strategies() -> dict[str, Any]:
    sessionmaker = get_sessionmaker()
    async with sessionmaker() as session:
        rows = (
            (await session.execute(select(Strategy).order_by(Strategy.created_at.desc())))
            .scalars()
            .all()
        )
    return {
        "strategies": [
            {
                "id": s.id,
                "name": s.name,
                "underlying": s.underlying,
                "spec": s.spec,
                "created_at": s.created_at,
            }
            for s in rows
        ]
    }


@router.post("/strategies")
async def create_or_preview(
    spec: StrategySpec, engine: PaperEngine = Depends(get_engine)
) -> dict[str, Any]:
    """Preview-only: persist the strategy and return expected fills/greeks/margin (no execution)."""
    strategy_id = await engine.create_strategy(spec)
    try:
        result = await engine.preview(spec)
    except InsufficientDepthError as exc:
        raise HTTPException(
            status_code=409, detail={"error": "insufficient_depth", "msg": str(exc)}
        ) from exc
    return {"strategy_id": strategy_id, "preview": _exec_result_payload(result)}


@router.post("/strategies/execute")
async def execute_strategy(
    req: ExecuteRequest, engine: PaperEngine = Depends(get_engine)
) -> dict[str, Any]:
    spec = req.spec
    if spec is None and req.strategy_id is not None:
        sessionmaker = get_sessionmaker()
        async with sessionmaker() as session:
            row = await session.get(Strategy, req.strategy_id)
        if row is None:
            raise HTTPException(status_code=404, detail="strategy not found")
        spec = StrategySpec.model_validate(row.spec)
    if spec is None:
        raise HTTPException(status_code=422, detail="provide spec or strategy_id")
    try:
        position_id = await engine.execute(spec, strategy_id=req.strategy_id)
    except InsufficientDepthError as exc:
        raise HTTPException(
            status_code=409, detail={"error": "insufficient_depth", "msg": str(exc)}
        ) from exc
    return await _position_detail(position_id)


@router.get("/positions")
async def list_positions(status: str | None = Query(None)) -> dict[str, Any]:
    sessionmaker = get_sessionmaker()
    async with sessionmaker() as session:
        stmt = select(PaperPosition).order_by(PaperPosition.opened_at.desc())
        if status:
            stmt = stmt.where(PaperPosition.status == status)
        positions = (await session.execute(stmt)).scalars().all()
        out = []
        for pos in positions:
            legs = (
                (await session.execute(select(PaperLeg).where(PaperLeg.position_id == pos.id)))
                .scalars()
                .all()
            )
            out.append(await _serialize_position(pos, legs))
    return {"positions": out}


@router.post("/positions/{position_id}/close")
async def close_position(
    position_id: int, req: CloseRequest, engine: PaperEngine = Depends(get_engine)
) -> dict[str, Any]:
    leg_qtys = {leg.leg_id: leg.qty for leg in req.legs} if req.legs else None
    try:
        result = await engine.close(position_id, leg_qtys)
    except InsufficientDepthError as exc:
        raise HTTPException(
            status_code=409, detail={"error": "insufficient_depth", "msg": str(exc)}
        ) from exc
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    detail = await _position_detail(position_id)
    detail["close"] = result
    return detail


@router.get("/positions/{position_id}/timeseries")
async def position_timeseries(
    position_id: int,
    fields: str = Query("close,delta,gamma,theta,vega,iv,rv_intraday,rv_historical"),
    from_: str | None = Query(None, alias="from"),
    to: str | None = Query(None),
) -> dict[str, Any]:
    return await read_timeseries(
        "paper_mtm_minute", "position_id", position_id, fields, from_=from_, to=to
    )


@router.get("/positions/{position_id}/mtm")
async def position_mtm(
    position_id: int,
    history: bool = Query(False),
    engine: PaperEngine = Depends(get_engine),
) -> dict[str, Any]:
    snap = await get_bus().get_latest(f"paper:mtm:{position_id}")
    rv = await _underlying_rv(engine._rest)
    out: dict[str, Any] = {"position_id": position_id, "latest": snap, "rv": rv}
    if history:
        out["curve"] = await _mtm_history(position_id)
    return out


# --- helpers --------------------------------------------------------------
async def _serialize_position(pos: PaperPosition, legs: Sequence[PaperLeg]) -> dict[str, Any]:
    snap = await get_bus().get_latest(f"paper:mtm:{pos.id}")
    return {
        "id": pos.id,
        "strategy_id": pos.strategy_id,
        "underlying": pos.underlying,
        "status": pos.status,
        "opened_at": pos.opened_at,
        "closed_at": pos.closed_at,
        "entry_cost": pos.entry_cost,
        "realized_pnl": pos.realized_pnl,
        "margin_estimate": pos.margin_estimate,
        "flags": pos.flags,
        "legs": [
            {
                "id": leg.id,
                "symbol": leg.symbol,
                "side": leg.side,
                "qty": leg.qty,
                "qty_open": leg.qty_open,
                "contract_size": leg.contract_size,
                "entry_fill": leg.entry_fill,
                "exit_fill": leg.exit_fill,
                "status": leg.status,
            }
            for leg in legs
        ],
        "mtm": snap or None,
    }


async def _position_detail(position_id: int) -> dict[str, Any]:
    sessionmaker = get_sessionmaker()
    async with sessionmaker() as session:
        pos = await session.get(PaperPosition, position_id)
        if pos is None:
            raise HTTPException(status_code=404, detail="position not found")
        legs = (
            (await session.execute(select(PaperLeg).where(PaperLeg.position_id == position_id)))
            .scalars()
            .all()
        )
        return await _serialize_position(pos, legs)


async def _mtm_history(position_id: int) -> list[dict[str, Any]]:
    sessionmaker = get_sessionmaker()
    async with sessionmaker() as session:
        rows = (
            await session.execute(
                text(
                    "SELECT ts, close, unrealized_pnl, realized_pnl, net_delta, "
                    "net_theta, strategy_iv FROM paper_mtm_minute "
                    "WHERE position_id = :pid ORDER BY ts"
                ),
                {"pid": position_id},
            )
        ).all()
    return [
        {
            "ts": r[0],
            "total_pnl": r[1],
            "unrealized_pnl": r[2],
            "realized_pnl": r[3],
            "net_delta": r[4],
            "net_theta": r[5],
            "strategy_iv": r[6],
        }
        for r in rows
    ]


async def _underlying_rv(rest: DeltaRestClient) -> dict[str, str | None]:
    # Intraday: our own minute bars; Historical: Delta daily candles.
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
        closes = [Decimal(str(r[0])) for r in rows if r[0] is not None]
        intraday = intraday_rv(closes)
    except Exception as exc:  # RV is best-effort
        logger.warning("intraday rv failed", error=str(exc))

    try:
        now = int(time.time())
        start = now - settings.rv_historical_window_days * 86400
        candles = await rest.get_candles(UNDERLYING_FUTURE, "1d", start, now)
        closes = [Decimal(str(c["close"])) for c in candles if c.get("close") is not None]
        historical = historical_rv(closes)
    except Exception as exc:
        logger.warning("historical rv failed", error=str(exc))

    return {
        "intraday": None if intraday is None else str(intraday),
        "historical": None if historical is None else str(historical),
        "window_minutes": str(settings.rv_intraday_window_minutes),
        "window_days": str(settings.rv_historical_window_days),
    }
