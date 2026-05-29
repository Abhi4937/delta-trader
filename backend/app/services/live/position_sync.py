"""Position sync (ADR 0004 §3): periodic authenticated REST snapshot of real
positions into Redis. Auth-WS live-merge is layered on top when keys are present.

Read-only. Does nothing useful without keys (auth fails -> empty, logged).
"""

from __future__ import annotations

import asyncio
from typing import Any

from app.core.logging import logger
from app.services.live.auth_gate import AuthGateError, keys_present
from app.services.live.types import LivePosition, normalize_position
from app.services.redis_bus import RedisBus, get_bus

POSITIONS_INDEX = "live:positions"
_SYNC_INTERVAL = 10.0


class PositionSync:
    def __init__(self, rest: Any, bus: RedisBus | None = None) -> None:
        self._rest = rest
        self._bus = bus or get_bus()
        self._running = False

    async def sync_once(self) -> list[LivePosition]:
        raw_list: list[dict[str, Any]] = await self._rest.get_positions()
        positions = [
            p for p in (normalize_position(r) for r in raw_list if isinstance(r, dict)) if p
        ]
        # Refresh Redis: clear the index, write each snapshot.
        symbols = {p.symbol for p in positions}
        for p in positions:
            await self._bus.set_latest(f"live:position:{p.symbol}", p.to_redis_mapping())
        if symbols:
            await self._bus.sadd(POSITIONS_INDEX, *symbols)
        logger.info("live positions synced", count=len(positions))
        return positions

    async def run(self) -> None:
        self._running = True
        logger.info("live position sync started", keys=keys_present())
        while self._running:
            if keys_present():
                try:
                    await self.sync_once()
                except AuthGateError as exc:
                    logger.warning("position sync auth gate", error=exc.error)
                except Exception as exc:
                    logger.warning("position sync failed", error=str(exc))
            await asyncio.sleep(_SYNC_INTERVAL)

    def stop(self) -> None:
        self._running = False
