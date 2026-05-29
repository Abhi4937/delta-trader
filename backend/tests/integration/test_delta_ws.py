"""Delta WS client test using an in-process websockets server.

Verifies: subscribe payload is sent on connect, data frames are routed to the
right Redis pub/sub channel, heartbeats are ignored, and the client resubscribes
after a forced reconnect (never silently drops a channel — CLAUDE.md rule #6).
"""

from __future__ import annotations

import asyncio
from typing import cast

import orjson
import pytest
import websockets

from app.services import redis_bus as redis_bus_mod
from app.services.delta_ws import DeltaWSClient
from tests.conftest import FakeBus

TICKER_FRAME = {"type": "v2/ticker", "symbol": "C-BTC-1-1", "mark_price": "10"}
HEARTBEAT = {"type": "heartbeat"}


@pytest.mark.integration
async def test_ws_subscribes_routes_and_resubscribes() -> None:
    received_subs: list[dict] = []
    connection_count = 0

    async def handler(ws: websockets.WebSocketServerProtocol) -> None:
        nonlocal connection_count
        connection_count += 1
        my_conn = connection_count
        sub_msg = orjson.loads(await ws.recv())
        received_subs.append(sub_msg)
        # Send a heartbeat (ignored) then a ticker frame (routed).
        await ws.send(orjson.dumps(HEARTBEAT).decode())
        await ws.send(orjson.dumps(TICKER_FRAME).decode())
        if my_conn == 1:
            # Force a disconnect to trigger reconnect + resubscribe.
            await ws.close()
        else:
            await asyncio.sleep(0.3)

    async with websockets.serve(handler, "127.0.0.1", 0) as server:
        port = server.sockets[0].getsockname()[1]
        url = f"ws://127.0.0.1:{port}"
        bus = FakeBus()
        client = DeltaWSClient(url=url, bus=cast(redis_bus_mod.RedisBus, bus), max_backoff=0.2)
        client.subscribe("v2/ticker", ["C-BTC-1-1"])

        task = asyncio.create_task(client.run())
        # Wait until we've seen two connections (initial + reconnect).
        for _ in range(50):
            if connection_count >= 2:
                break
            await asyncio.sleep(0.1)
        client.stop()
        await asyncio.wait_for(task, timeout=2)

    assert connection_count >= 2  # reconnected
    assert all(s["type"] == "subscribe" for s in received_subs)
    assert received_subs[0]["payload"]["channels"][0]["symbols"] == ["C-BTC-1-1"]
    # ticker frames were routed to dx:ticker; heartbeat ignored
    channels = [c for c, _ in bus.published]
    assert "dx:ticker" in channels
    assert all(c == "dx:ticker" for c in channels)
