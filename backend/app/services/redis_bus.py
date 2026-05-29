"""Async Redis client singleton + helpers for the hot path.

Key schema (see docs/DECISIONS/0002-foundation.md):
- ``latest:{symbol}``        hash, per-second snapshot, TTL 120s
- ``latest:spot:{under}``    hash, spot snapshot, TTL 120s
- ``dx:ticker|candle|spot``  pub/sub channels for normalized frames
- ``idx:symbols:{under}``    set of live symbols
- ``idx:expiries:{under}``   set of expiry codes
- ``idx:chain:{under}:{exp}``set of symbols in one expiry
"""

from __future__ import annotations

from collections.abc import Awaitable, Mapping
from typing import cast

import redis.asyncio as redis

from app.core.config import settings

LATEST_TTL_SECONDS = 120


class RedisBus:
    """Thin async wrapper around a shared redis connection pool."""

    def __init__(self, url: str) -> None:
        self._url = url
        self._client: redis.Redis | None = None

    @property
    def client(self) -> redis.Redis:
        if self._client is None:
            self._client = redis.from_url(  # type: ignore[no-untyped-call]
                self._url, decode_responses=True
            )
        return self._client

    async def ping(self) -> bool:
        return bool(await cast("Awaitable[bool]", self.client.ping()))

    async def close(self) -> None:
        if self._client is not None:
            await self._client.aclose()
            self._client = None

    # --- latest snapshots -------------------------------------------------
    async def set_latest(self, key: str, mapping: Mapping[str, str]) -> None:
        if not mapping:
            return
        async with self.client.pipeline(transaction=True) as pipe:
            pipe.hset(key, mapping=dict(mapping))
            pipe.expire(key, LATEST_TTL_SECONDS)
            await pipe.execute()

    async def get_latest(self, key: str) -> dict[str, str]:
        return await cast("Awaitable[dict[str, str]]", self.client.hgetall(key))

    # --- pub/sub ----------------------------------------------------------
    async def publish(self, channel: str, message: str) -> None:
        await self.client.publish(channel, message)

    def pubsub(self) -> redis.client.PubSub:
        return self.client.pubsub()

    # --- persistent hashes (no TTL — e.g. stop-loss state) ----------------
    async def set_hash(self, key: str, mapping: Mapping[str, str]) -> None:
        if mapping:
            await cast("Awaitable[int]", self.client.hset(key, mapping=dict(mapping)))

    async def delete(self, key: str) -> None:
        await cast("Awaitable[int]", self.client.delete(key))

    # --- index sets -------------------------------------------------------
    async def sadd(self, key: str, *members: str) -> None:
        if members:
            await cast("Awaitable[int]", self.client.sadd(key, *members))

    async def srem(self, key: str, *members: str) -> None:
        if members:
            await cast("Awaitable[int]", self.client.srem(key, *members))

    async def smembers(self, key: str) -> set[str]:
        return await cast("Awaitable[set[str]]", self.client.smembers(key))


_bus: RedisBus | None = None


def get_bus() -> RedisBus:
    global _bus
    if _bus is None:
        _bus = RedisBus(settings.redis_url)
    return _bus


async def close_bus() -> None:
    global _bus
    if _bus is not None:
        await _bus.close()
        _bus = None
