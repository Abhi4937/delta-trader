"""Candle history proxy (ADR 0005 §2): serves Delta ``/v2/history/candles`` for the
spot / option-premium charts, cached in Redis (5-min TTL for closed-bar ranges; the
in-progress current bar range is not cached)."""

from __future__ import annotations

import time
from typing import Any

import orjson
from fastapi import APIRouter, Query

from app.core.logging import logger
from app.services.delta_rest import DeltaRestClient
from app.services.redis_bus import get_bus

router = APIRouter(prefix="/spot", tags=["spot"])

_CACHE_TTL = 300  # 5 min


@router.get("/candles")
async def candles(
    symbol: str = Query("BTCUSD"),
    resolution: str = Query("1m"),
    start: int = Query(...),
    end: int = Query(...),
) -> dict[str, Any]:
    bus = get_bus()
    now = int(time.time())
    # Only cache fully-closed ranges (end safely in the past); the live bar isn't cached.
    cacheable = end < now - 60
    cache_key = f"candles:{symbol}:{resolution}:{start}:{end}"

    if cacheable:
        cached = await bus.get_latest(cache_key)
        if cached.get("data"):
            return {
                "symbol": symbol,
                "resolution": resolution,
                "candles": orjson.loads(cached["data"]),
                "cached": True,
            }

    rest = DeltaRestClient()
    try:
        result = await rest.get_candles(symbol, resolution, start, end)
    except Exception as exc:
        logger.warning("candles proxy failed", symbol=symbol, error=str(exc))
        result = []
    finally:
        await rest.aclose()

    rows = result if isinstance(result, list) else []
    if cacheable and rows:
        async with bus.client.pipeline(transaction=True) as pipe:
            pipe.hset(cache_key, mapping={"data": orjson.dumps(rows).decode()})
            pipe.expire(cache_key, _CACHE_TTL)
            await pipe.execute()
    return {"symbol": symbol, "resolution": resolution, "candles": rows, "cached": False}
