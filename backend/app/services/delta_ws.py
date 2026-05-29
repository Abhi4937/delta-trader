"""Delta Exchange India WebSocket multiplexer.

A SINGLE shared connection multiplexes all channels (ADR 0002 §2). On every
(re)connect it resubscribes the full desired-subscription set — the server does
not remember subscriptions. Reconnect uses exponential backoff with jitter and a
channel is never silently dropped (CLAUDE.md rule #6).

Incoming data frames are published verbatim to Redis pub/sub channels
``dx:ticker`` / ``dx:candle`` / ``dx:spot`` for the normalizer to consume.
"""

from __future__ import annotations

import asyncio
import contextlib
from collections.abc import Awaitable, Callable

import orjson
import websockets

from app.core import metrics
from app.core.config import settings
from app.core.logging import logger
from app.services.redis_bus import RedisBus, get_bus

# Delta WS data-frame "type" -> our Redis pub/sub channel.
_CHANNEL_ROUTING: dict[str, str] = {
    "v2/ticker": "dx:ticker",
    "candlestick_1m": "dx:candle",
    "spot_price": "dx:spot",
    "v2/spot_price": "dx:spot",
}

_IGNORED_TYPES = {"heartbeat", "subscriptions", "success", "error", "pong"}

ConnectFactory = Callable[[str], Awaitable[websockets.WebSocketClientProtocol]]


async def _default_connect(url: str) -> websockets.WebSocketClientProtocol:
    return await websockets.connect(url, ping_interval=20, ping_timeout=20)


class DeltaWSClient:
    def __init__(
        self,
        url: str | None = None,
        bus: RedisBus | None = None,
        connect: ConnectFactory | None = None,
        max_backoff: float = 30.0,
    ) -> None:
        self.url = url or settings.delta_ws_url
        self._bus = bus or get_bus()
        self._connect = connect or _default_connect
        self._max_backoff = max_backoff
        # desired subs: channel name -> ordered set of symbols
        self._subs: dict[str, set[str]] = {}
        self._stop = asyncio.Event()
        self.connected = False

    # --- subscription state ---------------------------------------------
    def subscribe(self, channel: str, symbols: list[str]) -> None:
        self._subs.setdefault(channel, set()).update(symbols)

    def _subscribe_payload(self) -> str:
        channels = [
            {"name": name, "symbols": sorted(symbols)}
            for name, symbols in self._subs.items()
            if symbols
        ]
        return orjson.dumps({"type": "subscribe", "payload": {"channels": channels}}).decode()

    # --- lifecycle -------------------------------------------------------
    def stop(self) -> None:
        self._stop.set()

    async def run(self) -> None:
        """Connect/read loop with reconnect. Returns when ``stop()`` is called."""
        backoff = 0.5
        attempt = 0
        while not self._stop.is_set():
            try:
                ws = await self._connect(self.url)
            except Exception as exc:
                attempt += 1
                metrics.delta_api_errors.inc()
                logger.warning("delta ws connect failed", attempt=attempt, error=str(exc))
                await self._sleep_backoff(backoff, attempt)
                backoff = min(backoff * 2, self._max_backoff)
                continue

            logger.info("delta ws connected", url=self.url)
            backoff = 0.5
            attempt = 0
            self.connected = True
            try:
                await self._resubscribe(ws)
                await self._read_loop(ws)
            except websockets.ConnectionClosed as exc:
                logger.warning("delta ws closed", code=exc.code, reason=str(exc.reason))
            except Exception as exc:
                logger.warning("delta ws error", error=str(exc))
            finally:
                self.connected = False
                with contextlib.suppress(Exception):
                    await ws.close()
            if not self._stop.is_set():
                metrics.delta_ws_reconnects.inc()
                await self._sleep_backoff(backoff, attempt)
                backoff = min(backoff * 2, self._max_backoff)

    async def _sleep_backoff(self, backoff: float, attempt: int) -> None:
        # Deterministic jitter (no RNG): spread by attempt count.
        jitter = (attempt % 5) * 0.1
        with contextlib.suppress(TimeoutError):
            await asyncio.wait_for(self._stop.wait(), timeout=backoff + jitter)

    async def _resubscribe(self, ws: websockets.WebSocketClientProtocol) -> None:
        if any(self._subs.values()):
            await ws.send(self._subscribe_payload())
            logger.info("delta ws resubscribed", channels=list(self._subs))

    async def _read_loop(self, ws: websockets.WebSocketClientProtocol) -> None:
        async for raw in ws:
            if self._stop.is_set():
                break
            await self._handle_frame(raw)

    async def _handle_frame(self, raw: str | bytes) -> None:
        try:
            frame = orjson.loads(raw)
        except orjson.JSONDecodeError:
            logger.warning("delta ws non-json frame")
            return
        ftype = frame.get("type", "")
        if ftype in _IGNORED_TYPES:
            return
        dx_channel = _CHANNEL_ROUTING.get(ftype)
        if dx_channel is None:
            return
        await self._bus.publish(dx_channel, orjson.dumps(frame).decode())
