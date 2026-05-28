"""Unit tests for tick normalization (Delta gotchas + Decimal safety)."""

from __future__ import annotations

from decimal import Decimal

from hypothesis import given
from hypothesis import strategies as st

from app.workers.tick_normalizer import (
    _dec,
    _normalize_iv,
    normalize_candle,
    normalize_spot,
    normalize_ticker,
)

TICKER_FRAME = {
    "type": "v2/ticker",
    "symbol": "P-BTC-75200-310526",
    "mark_price": "1952.58265734",
    "mark_vol": "0.2495043",
    "oi": "0.4550",
    "volume": 0.872,
    "greeks": {"delta": "-0.878", "gamma": "0.00012", "theta": "-59.4", "vega": "12.6"},
    "quotes": {"best_bid": "1943", "best_ask": "1971"},
    "timestamp": 1779998765391723,
}


def test_dec_parses_and_tolerates_garbage() -> None:
    assert _dec("1.5") == Decimal("1.5")
    assert _dec(2) == Decimal("2")
    assert _dec(None) is None
    assert _dec("") is None
    assert _dec("not-a-number") is None


def test_iv_heuristic_handles_both_scales() -> None:
    # REST fraction stays as-is; WS percent-scaled gets divided by 100.
    assert _normalize_iv(Decimal("0.2495")) == Decimal("0.2495")
    assert _normalize_iv(Decimal("55")) == Decimal("0.55")
    assert _normalize_iv(None) is None


def test_normalize_ticker_decimal_and_iv() -> None:
    tick = normalize_ticker(TICKER_FRAME)
    assert tick is not None
    assert tick.channel == "ticker"
    assert isinstance(tick.mark_price, Decimal)
    assert tick.iv == Decimal("0.2495043")  # already a fraction -> unchanged
    assert tick.delta == Decimal("-0.878")
    assert tick.best_bid == Decimal("1943")
    # ts parsed from microseconds
    assert tick.ts.year == 2026


def test_normalize_ticker_missing_symbol() -> None:
    assert normalize_ticker({"mark_price": "1"}) is None


def test_normalize_candle_and_spot() -> None:
    candle = normalize_candle(
        {"symbol": "BTCUSD", "open": "1", "high": "3", "low": "0.5", "close": "2"}
    )
    assert candle is not None
    assert candle.channel == "candle"
    assert candle.high == Decimal("3")

    spot = normalize_spot({"symbol": ".DEXBTUSD", "price": "73336.4"})
    assert spot is not None
    assert spot.channel == "spot"
    assert spot.mark_price == Decimal("73336.4")


@given(st.decimals(min_value=0, max_value=1000, places=2, allow_nan=False))
def test_iv_heuristic_monotonic_threshold(v: Decimal) -> None:
    out = _normalize_iv(v)
    assert out is not None
    # result is always a plausible sigma fraction (< original when scaled down)
    assert out <= v or v <= 5
