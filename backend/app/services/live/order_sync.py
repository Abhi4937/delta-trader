"""Order sync (ADR 0004 §3): periodic authenticated snapshot of open orders to Redis."""

from __future__ import annotations

import asyncio
from typing import Any

from app.core.logging import logger
from app.services.live.auth_gate import AuthGateError, keys_present
from app.services.redis_bus import RedisBus, get_bus

ORDERS_INDEX = "live:orders"
_SYNC_INTERVAL = 10.0


class OrderSync:
    def __init__(self, rest: Any, bus: RedisBus | None = None) -> None:
        self._rest = rest
        self._bus = bus or get_bus()
        self._running = False

    async def sync_once(self) -> list[dict[str, Any]]:
        orders: list[dict[str, Any]] = await self._rest.get_open_orders()
        ids = []
        for o in orders:
            oid = o.get("id")
            if oid is None:
                continue
            ids.append(str(oid))
            await self._bus.set_latest(
                f"live:order:{oid}",
                {
                    "id": str(oid),
                    "symbol": str(o.get("product_symbol") or o.get("symbol") or ""),
                    "side": str(o.get("side") or ""),
                    "size": str(o.get("size") or ""),
                    "state": str(o.get("state") or ""),
                },
            )
        if ids:
            await self._bus.sadd(ORDERS_INDEX, *ids)
        logger.info("live orders synced", count=len(orders))
        return orders

    async def run(self) -> None:
        self._running = True
        while self._running:
            if keys_present():
                try:
                    await self.sync_once()
                except AuthGateError as exc:
                    logger.warning("order sync auth gate", error=exc.error)
                except Exception as exc:
                    logger.warning("order sync failed", error=str(exc))
            await asyncio.sleep(_SYNC_INTERVAL)

    def stop(self) -> None:
        self._running = False
