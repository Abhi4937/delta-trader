"""Normalize raw Delta frames into ``Tick`` objects and fan them into Redis +
the minute buffer.

Delta gotchas (delta-api skill): ``mark_vol`` is IV*100; greeks/prices arrive as
strings -> Decimal; missing/empty -> None; heartbeats already filtered upstream.
"""

from __future__ import annotations

from datetime import UTC, datetime
from decimal import Decimal, InvalidOperation
from typing import Any

import orjson

from app.core import metrics
from app.core.logging import logger
from app.models.market import Tick
from app.services.redis_bus import RedisBus, get_bus
from app.workers.minute_buffer import MinuteBuffer


def _dec(value: Any) -> Decimal | None:
    """Parse a Delta string/number to Decimal, tolerating None/empty/garbage."""
    if value is None or value == "":
        return None
    try:
        return Decimal(str(value))
    except (InvalidOperation, ValueError):
        return None


def _ts(value: Any) -> datetime:
    """Delta timestamps are microseconds since epoch; fall back to now()."""
    if value is None:
        return datetime.now(tz=UTC)
    try:
        return datetime.fromtimestamp(int(value) / 1_000_000, tz=UTC)
    except (ValueError, OverflowError, OSError):
        return datetime.now(tz=UTC)


def _normalize_iv(mark_vol: Decimal | None) -> Decimal | None:
    """Return IV as a sigma fraction.

    Delta quirk: the WS ``v2/ticker`` channel historically sends ``mark_vol`` as
    IV*100 (e.g. ``"55"`` -> 0.55), but the India REST ``/v2/tickers`` already
    returns a fraction (e.g. ``"0.2495"``). Heuristic: values > 5 are treated as
    percent-scaled and divided by 100; values <= 5 are already fractions. Crypto
    option IV realistically lives in [0.05, 5.0]. See docs/DELTA_INTEGRATION.md.
    """
    if mark_vol is None:
        return None
    return mark_vol / 100 if mark_vol > 5 else mark_vol


def normalize_ticker(frame: dict[str, Any]) -> Tick | None:
    symbol = frame.get("symbol")
    if not symbol:
        return None
    iv = _normalize_iv(_dec(frame.get("mark_vol")))
    greeks = frame.get("greeks") or {}
    quotes = frame.get("quotes") or {}
    return Tick(
        symbol=str(symbol),
        channel="ticker",
        ts=_ts(frame.get("timestamp")),
        mark_price=_dec(frame.get("mark_price")),
        iv=iv,
        delta=_dec(greeks.get("delta")),
        gamma=_dec(greeks.get("gamma")),
        theta=_dec(greeks.get("theta")),
        vega=_dec(greeks.get("vega")),
        oi=_dec(frame.get("oi")),
        volume=_dec(frame.get("volume")),
        best_bid=_dec(quotes.get("best_bid")),
        best_ask=_dec(quotes.get("best_ask")),
    )


def normalize_candle(frame: dict[str, Any]) -> Tick | None:
    symbol = frame.get("symbol")
    if not symbol:
        return None
    return Tick(
        symbol=str(symbol),
        channel="candle",
        ts=_ts(frame.get("timestamp")),
        open=_dec(frame.get("open")),
        high=_dec(frame.get("high")),
        low=_dec(frame.get("low")),
        close=_dec(frame.get("close")),
    )


def normalize_spot(frame: dict[str, Any]) -> Tick | None:
    symbol = frame.get("symbol")
    if not symbol:
        return None
    price = (
        _dec(frame.get("price")) or _dec(frame.get("spot_price")) or _dec(frame.get("mark_price"))
    )
    return Tick(
        symbol=str(symbol),
        channel="spot",
        ts=_ts(frame.get("timestamp")),
        mark_price=price,
        close=price,
    )


class TickNormalizer:
    """Subscribes to ``dx:ticker`` and updates Redis + the shared minute buffer."""

    def __init__(self, buffer: MinuteBuffer, bus: RedisBus | None = None) -> None:
        self._buffer = buffer
        self._bus = bus or get_bus()
        self._running = False

    async def run(self) -> None:
        self._running = True
        pubsub = self._bus.pubsub()
        await pubsub.subscribe("dx:ticker")
        logger.info("tick normalizer started")
        try:
            async for message in pubsub.listen():
                if not self._running:
                    break
                if message.get("type") != "message":
                    continue
                await self._process(message["data"])
        finally:
            await pubsub.unsubscribe("dx:ticker")
            await pubsub.aclose()  # type: ignore[no-untyped-call]

    async def _process(self, data: str | bytes) -> None:
        try:
            frame = orjson.loads(data)
        except orjson.JSONDecodeError:
            return
        tick = normalize_ticker(frame)
        if tick is None:
            return
        await self._bus.set_latest(f"latest:{tick.symbol}", tick.to_redis_mapping())
        self._buffer.add(tick)
        metrics.ticks_received.inc()

    def stop(self) -> None:
        self._running = False
