"""Worker logic tests using in-memory fakes (no Redis/Postgres)."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any, cast

import orjson
import pytest

from app.services import redis_bus as redis_bus_mod
from app.workers import minute_aggregator as agg_mod
from app.workers.minute_aggregator import MinuteAggregator
from app.workers.minute_buffer import MinuteBuffer
from app.workers.spot_indexer import SpotIndexer
from app.workers.tick_normalizer import TickNormalizer
from tests.conftest import FakeAsyncpgConn, FakeBus


async def test_normalizer_process_updates_redis_and_buffer() -> None:
    bus = FakeBus()
    buffer = MinuteBuffer()
    worker = TickNormalizer(buffer, bus=cast(redis_bus_mod.RedisBus, bus))
    frame = {"symbol": "C-BTC-90000-310526", "mark_price": "100", "mark_vol": "0.3"}
    await worker._process(orjson.dumps(frame))
    assert "latest:C-BTC-90000-310526" in bus.latest
    assert bus.latest["latest:C-BTC-90000-310526"]["mark_price"] == "100"
    assert len(buffer) == 1


async def test_spot_indexer_routes_channels() -> None:
    bus = FakeBus()
    buffer = MinuteBuffer()
    worker = SpotIndexer(buffer, bus=cast(redis_bus_mod.RedisBus, bus))
    await worker._process("dx:spot", orjson.dumps({"symbol": ".DEXBTUSD", "price": "73000"}))
    assert any(k.startswith("latest:spot:") for k in bus.latest)
    await worker._process(
        "dx:candle",
        orjson.dumps({"symbol": "BTCUSD", "open": "1", "high": "2", "low": "1", "close": "2"}),
    )
    assert "latest:BTCUSD" in bus.latest
    assert len(buffer) == 2


async def test_aggregator_flush_upserts(monkeypatch: pytest.MonkeyPatch) -> None:
    buffer = MinuteBuffer()
    base = datetime(2026, 5, 28, 10, 30, 1, tzinfo=UTC)
    from decimal import Decimal

    from app.models.market import Tick

    buffer.add(Tick(symbol="C-BTC-1-1", channel="ticker", ts=base, mark_price=Decimal("100")))

    fake_conn = FakeAsyncpgConn()

    async def fake_connect(dsn: str, *args: Any, **kwargs: Any) -> FakeAsyncpgConn:
        return fake_conn

    monkeypatch.setattr(agg_mod.asyncpg, "connect", fake_connect)
    aggregator = MinuteAggregator(buffer, dsn="postgres://x")
    written = await aggregator.flush_once(datetime(2026, 5, 28, 10, 31, 5, tzinfo=UTC))

    assert written == 1
    assert len(fake_conn.copied) == 1
    assert fake_conn.copied[0][0] == "C-BTC-1-1"
    # idempotent upsert SQL must be issued
    assert any("ON CONFLICT (symbol, ts) DO UPDATE" in sql for sql in fake_conn.executed)


async def test_aggregator_no_rows_is_noop(monkeypatch: pytest.MonkeyPatch) -> None:
    aggregator = MinuteAggregator(MinuteBuffer(), dsn="postgres://x")
    assert await aggregator.flush_once(datetime.now(tz=UTC)) == 0


async def test_aggregator_rebuffers_on_db_failure(monkeypatch: pytest.MonkeyPatch) -> None:
    from decimal import Decimal

    from app.models.market import Tick

    buffer = MinuteBuffer()
    base = datetime(2026, 5, 28, 10, 30, 1, tzinfo=UTC)
    buffer.add(Tick(symbol="C-BTC-1-1", channel="ticker", ts=base, mark_price=Decimal("100")))
    later = datetime(2026, 5, 28, 10, 31, 5, tzinfo=UTC)

    async def boom(dsn: str, *a: Any, **k: Any) -> Any:
        raise OSError("db down")

    monkeypatch.setattr(agg_mod.asyncpg, "connect", boom)
    aggregator = MinuteAggregator(buffer, dsn="postgres://x")
    with pytest.raises(OSError):
        await aggregator.flush_once(later)
    # The minute bar must NOT be lost — it is restored for the next flush.
    assert len(buffer) == 1

    # Recovery: a working connection now flushes the restored row.
    fake_conn = FakeAsyncpgConn()

    async def ok(dsn: str, *a: Any, **k: Any) -> FakeAsyncpgConn:
        return fake_conn

    monkeypatch.setattr(agg_mod.asyncpg, "connect", ok)
    assert await aggregator.flush_once(later) == 1
    assert fake_conn.copied[0][0] == "C-BTC-1-1"
