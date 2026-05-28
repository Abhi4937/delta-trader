"""Unit + property tests for the minute aggregation buffer."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from decimal import Decimal

from hypothesis import given
from hypothesis import strategies as st

from app.models.market import Tick
from app.workers.minute_buffer import MinuteBuffer, minute_floor


def _tick(symbol: str, ts: datetime, price: str) -> Tick:
    return Tick(symbol=symbol, channel="ticker", ts=ts, mark_price=Decimal(price))


def test_minute_floor_truncates_seconds() -> None:
    ts = datetime(2026, 5, 28, 10, 30, 45, 123456, tzinfo=UTC)
    assert minute_floor(ts) == datetime(2026, 5, 28, 10, 30, 0, tzinfo=UTC)


def test_buffer_builds_ohlc() -> None:
    base = datetime(2026, 5, 28, 10, 30, 5, tzinfo=UTC)
    buf = MinuteBuffer()
    buf.add(_tick("C-BTC-1-1", base, "100"))
    buf.add(_tick("C-BTC-1-1", base + timedelta(seconds=10), "120"))
    buf.add(_tick("C-BTC-1-1", base + timedelta(seconds=20), "90"))
    buf.add(_tick("C-BTC-1-1", base + timedelta(seconds=30), "110"))
    # minute not yet closed
    assert buf.drain_closed(base + timedelta(seconds=40)) == []
    drained = buf.drain_closed(base + timedelta(minutes=1, seconds=1))
    assert len(drained) == 1
    acc = drained[0]
    assert acc.open == Decimal("100")
    assert acc.high == Decimal("120")
    assert acc.low == Decimal("90")
    assert acc.close == Decimal("110")
    assert len(buf) == 0  # drained buckets removed


def test_drain_is_idempotent_after_empty() -> None:
    buf = MinuteBuffer()
    assert buf.drain_closed(datetime.now(tz=UTC)) == []


@given(st.lists(st.integers(min_value=1, max_value=10_000), min_size=1, max_size=50))
def test_ohlc_invariants(prices: list[int]) -> None:
    base = datetime(2026, 5, 28, 10, 30, 1, tzinfo=UTC)
    buf = MinuteBuffer()
    for i, p in enumerate(prices):
        buf.add(_tick("X", base + timedelta(milliseconds=i), str(p)))
    drained = buf.drain_closed(base + timedelta(minutes=1, seconds=1))
    acc = drained[0]
    assert acc.low is not None and acc.high is not None
    assert acc.low <= acc.open <= acc.high
    assert acc.low <= acc.close <= acc.high
    assert acc.high == Decimal(max(prices))
    assert acc.low == Decimal(min(prices))
