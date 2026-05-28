"""Frontend-facing WebSocket hub at ``/ws``.

Accepts subscribe/unsubscribe control messages and pushes throttled snapshots
(≤ 2 Hz per channel) built from Redis ``latest:*`` hashes. Decimals are emitted as
strings (money safety). See ADR 0002 §7 for the protocol.
"""

from __future__ import annotations

import asyncio
import contextlib
from typing import Any

import orjson
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from starlette.websockets import WebSocketState

from app.api.products import _row_from_redis
from app.core.logging import logger
from app.services.redis_bus import get_bus

router = APIRouter()

_PUSH_INTERVAL_SECONDS = 0.5  # 2 Hz


def _encode(payload: dict[str, Any]) -> str:
    return orjson.dumps(payload, default=str).decode()


SubKey = tuple[str, str, str | None, int | None]


class Subscription:
    __slots__ = ("kind", "underlying", "expiry", "pid")

    def __init__(
        self, kind: str, underlying: str, expiry: str | None, pid: int | None = None
    ) -> None:
        self.kind = kind
        self.underlying = underlying
        self.expiry = expiry
        self.pid = pid

    def key(self) -> SubKey:
        return (self.kind, self.underlying, self.expiry, self.pid)


@router.websocket("/ws")
async def ws_endpoint(websocket: WebSocket) -> None:
    await websocket.accept()
    subs: dict[SubKey, Subscription] = {}
    push_task = asyncio.create_task(_push_loop(websocket, subs))
    try:
        while True:
            raw = await websocket.receive_text()
            await _handle_control(raw, subs, websocket)
    except WebSocketDisconnect:
        pass
    except Exception as exc:
        logger.warning("frontend ws error", error=str(exc))
    finally:
        push_task.cancel()
        with contextlib.suppress(Exception):
            await push_task


async def _handle_control(
    raw: str,
    subs: dict[SubKey, Subscription],
    websocket: WebSocket,
) -> None:
    try:
        msg = orjson.loads(raw)
    except orjson.JSONDecodeError:
        await websocket.send_text(_encode({"ch": "error", "msg": "invalid json"}))
        return
    underlying = str(msg.get("underlying", "BTC")).upper()
    expiry = msg.get("expiry")
    pid = msg.get("id")
    pid_int = int(pid) if pid is not None else None
    if "sub" in msg:
        kind = str(msg["sub"])
        sub = Subscription(kind, underlying, expiry, pid_int)
        subs[sub.key()] = sub
        await websocket.send_text(
            _encode(
                {
                    "ch": "subscribed",
                    "sub": kind,
                    "underlying": underlying,
                    "expiry": expiry,
                    "id": pid_int,
                }
            )
        )
    elif "unsub" in msg:
        kind = str(msg["unsub"])
        subs.pop((kind, underlying, expiry, pid_int), None)


async def _push_loop(
    websocket: WebSocket,
    subs: dict[SubKey, Subscription],
) -> None:
    bus = get_bus()
    while True:
        await asyncio.sleep(_PUSH_INTERVAL_SECONDS)
        # Stop quietly once the socket is closing (avoids send-after-close tracebacks).
        if websocket.client_state != WebSocketState.CONNECTED:
            return
        try:
            await _push_subscriptions(websocket, bus, subs)
        except (WebSocketDisconnect, RuntimeError):
            return


async def _push_subscriptions(
    websocket: WebSocket,
    bus: Any,
    subs: dict[SubKey, Subscription],
) -> None:
    for sub in list(subs.values()):
        if sub.kind == "paper_position" and sub.pid is not None:
            snap = await bus.get_latest(f"paper:mtm:{sub.pid}")
            if snap:
                await websocket.send_text(_encode({"ch": "paper_position", "id": sub.pid, **snap}))
        elif sub.kind == "option_chain" and sub.expiry:
            symbols = sorted(await bus.smembers(f"idx:chain:{sub.underlying}:{sub.expiry}"))
            rows = []
            for symbol in symbols:
                snap = await bus.get_latest(f"latest:{symbol}")
                if snap:
                    rows.append(_row_from_redis(symbol, snap))
            if rows:
                await websocket.send_text(
                    _encode(
                        {
                            "ch": "option_chain",
                            "underlying": sub.underlying,
                            "expiry": sub.expiry,
                            "rows": rows,
                        }
                    )
                )
        elif sub.kind == "candles":
            snap = await bus.get_latest(f"latest:spot:{sub.underlying}")
            if snap:
                await websocket.send_text(
                    _encode(
                        {
                            "ch": "candle",
                            "underlying": sub.underlying,
                            "close": snap.get("close") or snap.get("mark_price"),
                            "ts": snap.get("ts"),
                        }
                    )
                )
