"""Spot/candle indexer: same pattern as the tick normalizer but for the BTC spot
index (``.DEXBTUSD``) and 1m candle frames.

Updates ``latest:spot:{underlying}`` and ``latest:{symbol}`` snapshots in Redis and
feeds the shared minute buffer so spot/candle bars also persist to ``ticks_minute``.
"""

from __future__ import annotations

import orjson

from app.core.config import settings
from app.core.logging import logger
from app.services.redis_bus import RedisBus, get_bus
from app.workers.minute_buffer import MinuteBuffer
from app.workers.tick_normalizer import normalize_candle, normalize_spot


class SpotIndexer:
    def __init__(self, buffer: MinuteBuffer, bus: RedisBus | None = None) -> None:
        self._buffer = buffer
        self._bus = bus or get_bus()
        self._running = False
        self._underlying = settings.underlying_list[0] if settings.underlying_list else "BTC"

    async def run(self) -> None:
        self._running = True
        pubsub = self._bus.pubsub()
        await pubsub.subscribe("dx:spot", "dx:candle")
        logger.info("spot indexer started")
        try:
            async for message in pubsub.listen():
                if not self._running:
                    break
                if message.get("type") != "message":
                    continue
                await self._process(message["channel"], message["data"])
        finally:
            await pubsub.unsubscribe("dx:spot", "dx:candle")
            await pubsub.aclose()  # type: ignore[no-untyped-call]

    async def _process(self, channel: str, data: str | bytes) -> None:
        try:
            frame = orjson.loads(data)
        except orjson.JSONDecodeError:
            return
        if channel == "dx:spot":
            tick = normalize_spot(frame)
            if tick is None:
                return
            await self._bus.set_latest(f"latest:spot:{self._underlying}", tick.to_redis_mapping())
        else:  # dx:candle
            tick = normalize_candle(frame)
            if tick is None:
                return
            await self._bus.set_latest(f"latest:{tick.symbol}", tick.to_redis_mapping())
        self._buffer.add(tick)

    def stop(self) -> None:
        self._running = False
