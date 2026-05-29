"""Whole-strategy stop-loss state machine (ADR 0004 §5).

ARMED -> TRIGGERED -> CLOSING -> CLOSED | FAILED. State lives in Redis
``live:sl:{id}`` (+ an index set) so a kill/restart RESUMES monitoring and any
interrupted CLOSING re-runs (closes are reduce_only -> idempotent). A loss must
breach the threshold for ``sl_debounce_ticks`` consecutive non-stale ticks before
firing (no spurious fires).
"""

from __future__ import annotations

import asyncio
import json
from datetime import UTC, datetime
from decimal import Decimal

from sqlalchemy import text

from app.core import metrics
from app.core.config import settings
from app.core.logging import logger
from app.db.session import get_sessionmaker
from app.services.live import mtm as mtm_mod
from app.services.live.closer import LiveCloser
from app.services.live.strategy_grouper import strategy_symbols
from app.services.live.types import _dec
from app.services.redis_bus import RedisBus, get_bus

SL_INDEX = "live:sl:index"

ARMED, TRIGGERED, CLOSING, CLOSED, FAILED = (
    "ARMED",
    "TRIGGERED",
    "CLOSING",
    "CLOSED",
    "FAILED",
)


def _key(strategy_id: int) -> str:
    return f"live:sl:{strategy_id}"


def _now() -> str:
    return datetime.now(tz=UTC).isoformat()


async def arm(
    strategy_id: int,
    *,
    threshold_abs: Decimal | None,
    threshold_pct: Decimal | None,
    bus: RedisBus | None = None,
) -> None:
    """Persist an ARMED stop-loss. The API enforces the auth gate before calling."""
    bus = bus or get_bus()
    mapping = {
        "state": ARMED,
        "armed_at": _now(),
        "breach_count": "0",
        "attempts": "0",
    }
    if threshold_abs is not None:
        mapping["threshold_abs"] = str(threshold_abs)
    if threshold_pct is not None:
        mapping["threshold_pct"] = str(threshold_pct)
    await bus.set_hash(_key(strategy_id), mapping)
    await bus.sadd(SL_INDEX, str(strategy_id))
    await _event(
        strategy_id,
        None,
        ARMED,
        {"threshold_abs": str(threshold_abs), "threshold_pct": str(threshold_pct)},
    )


async def disarm(strategy_id: int, bus: RedisBus | None = None) -> bool:
    """Disarm only while ARMED. Returns False if not ARMED (caller -> 409)."""
    bus = bus or get_bus()
    state = await bus.get_latest(_key(strategy_id))
    if state.get("state") != ARMED:
        return False
    await bus.delete(_key(strategy_id))
    await bus.srem(SL_INDEX, str(strategy_id))
    await _event(strategy_id, ARMED, "DISARMED", {})
    return True


async def _event(strategy_id: int, frm: str | None, to: str, detail: dict[str, object]) -> None:
    sessionmaker = get_sessionmaker()
    async with sessionmaker() as session, session.begin():
        await session.execute(
            text(
                "INSERT INTO live_sl_events (strategy_id, from_state, to_state, detail) "
                "VALUES (:sid, :frm, :to, CAST(:detail AS jsonb))"
            ),
            {"sid": strategy_id, "frm": frm, "to": to, "detail": json.dumps(detail)},
        )
    await get_bus().publish(f"live:strategy:{strategy_id}", json.dumps({"sl_state": to, **detail}))


class SLMonitor:
    def __init__(self, closer: LiveCloser, bus: RedisBus | None = None) -> None:
        self._closer = closer
        self._bus = bus or get_bus()
        self._running = False
        self._debounce = settings.sl_debounce_ticks

    async def run(self) -> None:
        self._running = True
        logger.info("sl monitor started")
        while self._running:
            await asyncio.sleep(1)
            try:
                await self._tick()
            except Exception as exc:
                logger.warning("sl monitor tick failed", error=str(exc))

    def stop(self) -> None:
        self._running = False

    async def _tick(self) -> None:
        # Copy the index — _do_close mutates it via srem mid-iteration.
        for sid_str in list(await self._bus.smembers(SL_INDEX)):
            sid = int(sid_str)
            state = await self._bus.get_latest(_key(sid))
            current = state.get("state")
            if current in (CLOSING, TRIGGERED):
                # Interrupted mid-close (restart) -> resume; reduce_only is idempotent.
                await self._do_close(sid, state)
            elif current == ARMED:
                await self._check_armed(sid, state)

    async def _check_armed(self, sid: int, state: dict[str, str]) -> None:
        symbols = await strategy_symbols(sid)
        agg = await mtm_mod.aggregate(symbols, bus=self._bus)
        loss = -agg.total_pnl  # positive loss = drawdown
        breaching = (not agg.mark_stale) and self._breaches(loss, agg.margin, state)
        breach_count = int(state.get("breach_count", "0"))
        breach_count = breach_count + 1 if breaching else 0
        await self._bus.set_hash(_key(sid), {"breach_count": str(breach_count)})
        if breach_count >= self._debounce:
            logger.info("sl threshold breached", strategy_id=sid, loss=str(loss))
            await self._do_close(sid, state)

    def _breaches(self, loss: Decimal, margin: Decimal, state: dict[str, str]) -> bool:
        t_abs = _dec(state.get("threshold_abs"))
        t_pct = _dec(state.get("threshold_pct"))
        if t_abs is not None and loss >= t_abs:
            return True
        return bool(t_pct is not None and margin > 0 and loss >= (t_pct / 100) * margin)

    async def _do_close(self, sid: int, state: dict[str, str]) -> None:
        await self._bus.set_hash(_key(sid), {"state": CLOSING, "triggered_at": _now()})
        await _event(sid, state.get("state"), CLOSING, {})
        metrics.sl_triggered.inc()
        attempts = int(state.get("attempts", "0")) + 1
        try:
            result = await self._closer.close_strategy(sid, confirm=True)
        except Exception as exc:
            await self._bus.set_hash(_key(sid), {"state": FAILED, "attempts": str(attempts)})
            await self._bus.srem(SL_INDEX, str(sid))
            await _event(sid, CLOSING, FAILED, {"error": str(exc)})
            return
        if result.all_closed:
            await self._bus.set_hash(_key(sid), {"state": CLOSED, "attempts": str(attempts)})
            await self._bus.srem(SL_INDEX, str(sid))
            await _event(sid, CLOSING, CLOSED, {"legs": len(result.legs)})
        else:
            await self._bus.set_hash(_key(sid), {"state": FAILED, "attempts": str(attempts)})
            await self._bus.srem(SL_INDEX, str(sid))
            await _event(
                sid,
                CLOSING,
                FAILED,
                {"failed": [leg.symbol for leg in result.legs if not leg.ok]},
            )
