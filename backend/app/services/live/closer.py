"""The live closer (ADR 0004 §6, §7) — the ONLY real-money write path.

Gate is checked BEFORE any payload is built. The intent is logged at INFO (no keys
/ no signature) before sending. Each leg is a market ``reduce_only`` close so it can
never open or flip a position. A failed leg is retried once; if it still fails the
result records which legs closed and which did not (never a silent half-close).
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass, field
from decimal import Decimal
from typing import Any

from app.core.logging import logger
from app.services.live.auth_gate import require_auth
from app.services.live.strategy_grouper import strategy_symbols
from app.services.live.types import _dec
from app.services.redis_bus import RedisBus, get_bus


@dataclass
class LegClose:
    symbol: str
    product_id: int | None
    requested: dict[str, Any]
    ok: bool
    detail: str = ""


@dataclass
class CloseResult:
    legs: list[LegClose] = field(default_factory=list)
    all_closed: bool = False


def build_close_payload(symbol: str, product_id: int | None, size: Decimal) -> dict[str, Any]:
    """Market reduce_only close: opposite side of the (signed) position size."""
    side = "sell" if size > 0 else "buy"
    return {
        "product_id": product_id,
        "size": int(abs(size)),
        "side": side,
        "order_type": "market_order",
        "reduce_only": "true",
        "time_in_force": "ioc",
    }


class LiveCloser:
    def __init__(self, rest: Any, bus: RedisBus | None = None) -> None:
        self._rest = rest
        self._bus = bus or get_bus()

    async def close_strategy(self, strategy_id: int, *, confirm: bool) -> CloseResult:
        # GATE FIRST — before any payload is built (503/403/422).
        require_auth(order_placing=True, confirm=confirm)

        symbols = await strategy_symbols(strategy_id)
        payloads: list[tuple[str, int | None, dict[str, Any]]] = []
        for symbol in symbols:
            pos = await self._bus.get_latest(f"live:position:{symbol}")
            size = _dec(pos.get("size")) if pos else None
            if not size or size == 0:
                continue
            pid = int(pos["product_id"]) if pos.get("product_id") else None
            payloads.append((symbol, pid, build_close_payload(symbol, pid, size)))

        logger.info(
            "about to place close orders",
            strategy_id=strategy_id,
            legs=[{"symbol": s, "payload": p} for s, _pid, p in payloads],
        )

        result = CloseResult()
        outcomes = await asyncio.gather(
            *(self._place_with_retry(p) for _s, _pid, p in payloads),
            return_exceptions=True,
        )
        for (symbol, pid, payload), outcome in zip(payloads, outcomes, strict=True):
            ok = not isinstance(outcome, BaseException)
            result.legs.append(
                LegClose(
                    symbol=symbol,
                    product_id=pid,
                    requested=payload,
                    ok=ok,
                    detail="" if ok else str(outcome),
                )
            )
        result.all_closed = bool(result.legs) and all(leg.ok for leg in result.legs)
        logger.info(
            "close orders complete",
            strategy_id=strategy_id,
            all_closed=result.all_closed,
            failed=[leg.symbol for leg in result.legs if not leg.ok],
        )
        return result

    async def _place_with_retry(self, payload: dict[str, Any]) -> Any:
        try:
            return await self._rest.place_order(payload)
        except Exception as first:
            logger.warning("close order failed; retrying once", error=str(first))
            return await self._rest.place_order(payload)
