"""In-memory per-minute aggregation buffer shared by the normalizer (writer) and
the minute-aggregator (drainer).

A bucket is keyed by ``(symbol, minute_start_utc)``. OHLC is built from
``mark_price`` (or candle close); greeks/iv/oi/volume hold the last observed value
in the minute. Closed buckets (bucket < current minute) are drained and upserted.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import UTC, datetime
from decimal import Decimal

from app.models.market import Tick


def minute_floor(ts: datetime) -> datetime:
    ts = ts.astimezone(UTC)
    return ts.replace(second=0, microsecond=0)


@dataclass
class MinuteAccumulator:
    symbol: str
    ts: datetime
    open: Decimal | None = None
    high: Decimal | None = None
    low: Decimal | None = None
    close: Decimal | None = None
    mark_price: Decimal | None = None
    iv: Decimal | None = None
    delta: Decimal | None = None
    gamma: Decimal | None = None
    theta: Decimal | None = None
    vega: Decimal | None = None
    oi: Decimal | None = None
    volume: Decimal | None = None

    def update(self, tick: Tick) -> None:
        price = tick.close if tick.close is not None else tick.mark_price
        if price is not None:
            if self.open is None:
                self.open = price
            self.high = price if self.high is None else max(self.high, price)
            self.low = price if self.low is None else min(self.low, price)
            self.close = price
        if tick.mark_price is not None:
            self.mark_price = tick.mark_price
        for fld in ("iv", "delta", "gamma", "theta", "vega", "oi", "volume"):
            val = getattr(tick, fld)
            if val is not None:
                setattr(self, fld, val)

    def merge_older(self, other: MinuteAccumulator) -> None:
        """Fold an earlier (drained-but-unflushed) accumulator into this one.

        ``other`` precedes ``self`` chronologically, so ``other.open`` is the true
        open; this accumulator's ``close`` stays the latest. Extremes combine.
        """
        if other.open is not None:
            self.open = other.open
        for hi in (other.high,):
            if hi is not None:
                self.high = hi if self.high is None else max(self.high, hi)
        for lo in (other.low,):
            if lo is not None:
                self.low = lo if self.low is None else min(self.low, lo)
        if self.close is None:
            self.close = other.close
        for fld in ("mark_price", "iv", "delta", "gamma", "theta", "vega", "oi", "volume"):
            if getattr(self, fld) is None and getattr(other, fld) is not None:
                setattr(self, fld, getattr(other, fld))

    def as_row(self) -> tuple[object, ...]:
        return (
            self.symbol,
            self.ts,
            self.open,
            self.high,
            self.low,
            self.close,
            self.mark_price,
            self.iv,
            self.delta,
            self.gamma,
            self.theta,
            self.vega,
            self.oi,
            self.volume,
        )


ROW_COLUMNS = (
    "symbol",
    "ts",
    "open",
    "high",
    "low",
    "close",
    "mark_price",
    "iv",
    "delta",
    "gamma",
    "theta",
    "vega",
    "oi",
    "volume",
)


@dataclass
class MinuteBuffer:
    _buckets: dict[tuple[str, datetime], MinuteAccumulator] = field(default_factory=dict)

    def add(self, tick: Tick) -> None:
        bucket = minute_floor(tick.ts)
        key = (tick.symbol, bucket)
        acc = self._buckets.get(key)
        if acc is None:
            acc = MinuteAccumulator(symbol=tick.symbol, ts=bucket)
            self._buckets[key] = acc
        acc.update(tick)

    def drain_closed(self, now: datetime) -> list[MinuteAccumulator]:
        """Remove and return accumulators for minutes that have fully closed."""
        current = minute_floor(now)
        closed_keys = [k for k, acc in self._buckets.items() if acc.ts < current]
        drained = [self._buckets.pop(k) for k in closed_keys]
        return drained

    def readd(self, accumulators: list[MinuteAccumulator]) -> None:
        """Restore drained accumulators after a failed flush (no data loss).

        If late ticks re-created a bucket for the same (symbol, ts) while the flush
        was in flight, merge the drained values into it.
        """
        for acc in accumulators:
            key = (acc.symbol, acc.ts)
            existing = self._buckets.get(key)
            if existing is None:
                self._buckets[key] = acc
            else:
                existing.merge_older(acc)

    def __len__(self) -> int:
        return len(self._buckets)
