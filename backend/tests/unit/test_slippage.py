"""Slippage model: orderbook walk + linear impact (ADR 0003 §2)."""

from __future__ import annotations

from decimal import Decimal

import pytest
from hypothesis import given
from hypothesis import strategies as st

from app.services.quant.slippage import (
    InsufficientDepthError,
    Level,
    OrderBook,
    compute_fill,
    walk_book,
)

K = Decimal("0.0001")
FLOOR = Decimal("0.005")


def _book() -> OrderBook:
    return OrderBook(
        bids=[Level(Decimal("99"), Decimal("5")), Level(Decimal("98"), Decimal("10"))],
        asks=[Level(Decimal("100"), Decimal("5")), Level(Decimal("101"), Decimal("10"))],
    )


def test_walk_single_level_vwap() -> None:
    vwap, consumed = walk_book([Level(Decimal("100"), Decimal("10"))], Decimal("3"))
    assert vwap == Decimal("100")
    assert consumed == [("100", "3")]


def test_walk_multi_level_vwap() -> None:
    levels = [Level(Decimal("100"), Decimal("5")), Level(Decimal("101"), Decimal("10"))]
    vwap, _ = walk_book(levels, Decimal("10"))
    # (100*5 + 101*5)/10 = 100.5
    assert vwap == Decimal("100.5")


def test_walk_insufficient_depth_raises() -> None:
    with pytest.raises(InsufficientDepthError):
        walk_book([Level(Decimal("100"), Decimal("2"))], Decimal("5"))


def test_walk_zero_qty_raises() -> None:
    with pytest.raises(ValueError, match="qty must be"):
        walk_book([Level(Decimal("100"), Decimal("2"))], Decimal("0"))


def test_buy_walks_asks_sell_walks_bids() -> None:
    buy = compute_fill("buy", Decimal("3"), _book(), Decimal("1"), None, K, FLOOR)
    sell = compute_fill("sell", Decimal("3"), _book(), Decimal("1"), None, K, FLOOR)
    assert buy.vwap == Decimal("100")  # best ask
    assert sell.vwap == Decimal("99")  # best bid
    # illiquid (vol None) => floor impact; buy pays up, sell receives less
    assert buy.fill_price > buy.vwap
    assert sell.fill_price < sell.vwap


def test_impact_zero_volume_uses_floor() -> None:
    f = compute_fill("buy", Decimal("1"), _book(), Decimal("1"), None, K, FLOOR)
    # impact fraction = floor (0.005); impact = 100 * 0.005 = 0.5
    assert f.impact == Decimal("0.5")
    assert f.fill_price == Decimal("100.5")


def test_impact_scales_with_volume() -> None:
    big_vol = Decimal("1000000")
    f = compute_fill("buy", Decimal("1"), _book(), Decimal("1"), big_vol, K, FLOOR)
    # tiny order vs huge volume => negligible impact, well under floor
    assert f.impact < Decimal("0.5")
    assert f.fill_price > Decimal("100")


@given(
    qty=st.integers(min_value=1, max_value=5).map(Decimal),
    extra=st.integers(min_value=1, max_value=10).map(Decimal),
)
def test_larger_size_never_better_price(qty: Decimal, extra: Decimal) -> None:
    book = OrderBook(
        bids=[],
        asks=[
            Level(Decimal("100"), Decimal("5")),
            Level(Decimal("101"), Decimal("20")),
            Level(Decimal("102"), Decimal("50")),
        ],
    )
    small = compute_fill("buy", qty, book, Decimal("1"), Decimal("1000"), K, FLOOR)
    large = compute_fill("buy", qty + extra, book, Decimal("1"), Decimal("1000"), K, FLOOR)
    # buying more walks deeper => fill price monotonically non-decreasing
    assert large.fill_price >= small.fill_price
