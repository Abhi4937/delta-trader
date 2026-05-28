"""Entry/close execution as pure functions over fetched market data."""

from __future__ import annotations

from decimal import Decimal

import pytest

from app.services.paper.closer import CloseLeg, execute_close
from app.services.paper.executor import execute_entry
from app.services.paper.models import LegSpec, StrategySpec
from app.services.quant.slippage import InsufficientDepthError, Level, OrderBook

K = Decimal("0.0001")
FLOOR = Decimal("0.005")


def _book(bid: str, ask: str, size: str = "100") -> OrderBook:
    return OrderBook(
        bids=[Level(Decimal(bid), Decimal(size))],
        asks=[Level(Decimal(ask), Decimal(size))],
    )


def test_execute_entry_atomic_and_cost_sign() -> None:
    spec = StrategySpec(
        name="straddle",
        legs=[
            LegSpec(symbol="C-BTC-100-1", side="sell", qty=Decimal("1")),
            LegSpec(symbol="P-BTC-100-1", side="sell", qty=Decimal("1")),
        ],
    )
    books = {"C-BTC-100-1": _book("50", "52"), "P-BTC-100-1": _book("40", "42")}
    cs = {"C-BTC-100-1": Decimal("1"), "P-BTC-100-1": Decimal("1")}
    vol = {"C-BTC-100-1": Decimal("1000000"), "P-BTC-100-1": Decimal("1000000")}
    pids = {"C-BTC-100-1": 1, "P-BTC-100-1": 2}

    result = execute_entry(spec, books, cs, vol, pids, k=K, illiquid_floor=FLOOR)
    assert len(result.legs) == 2
    # both legs sold => entry_cost is a net credit (negative)
    assert result.entry_cost < 0
    # sells walk bids (50 and 40), receive slightly less after impact
    sell_call = result.legs[0]
    assert sell_call.fill.vwap == Decimal("50")
    assert sell_call.fill.fill_price < Decimal("50")
    assert result.margin_estimate > 0


def test_execute_entry_insufficient_depth_aborts() -> None:
    spec = StrategySpec(name="x", legs=[LegSpec(symbol="C", side="buy", qty=Decimal("500"))])
    books = {"C": _book("50", "52", size="10")}  # only 10 available, need 500
    with pytest.raises(InsufficientDepthError):
        execute_entry(
            spec, books, {"C": Decimal("1")}, {"C": None}, {"C": 1}, k=K, illiquid_floor=FLOOR
        )


def test_execute_close_reverse_walk_realizes_pnl() -> None:
    # entered short @ 50 (entry_side sell); closing buys back from asks @ 40 => profit
    close_legs = [
        CloseLeg(
            leg_id=1,
            symbol="C",
            entry_side="sell",
            qty_close=Decimal("1"),
            contract_size=Decimal("1"),
            entry_fill=Decimal("50"),
        )
    ]
    books = {"C": _book("38", "40")}
    result = execute_close(close_legs, books, {"C": Decimal("1000000")}, k=K, illiquid_floor=FLOOR)
    # buying back ~40 (asks) below the 50 short entry => positive realized
    assert result.legs[0].fill.vwap == Decimal("40")
    assert result.realized_pnl > 0


def test_execute_close_long_sells_into_bids() -> None:
    close_legs = [
        CloseLeg(
            leg_id=2,
            symbol="C",
            entry_side="buy",
            qty_close=Decimal("1"),
            contract_size=Decimal("1"),
            entry_fill=Decimal("30"),
        )
    ]
    books = {"C": _book("45", "47")}  # selling a long hits the bid 45
    result = execute_close(close_legs, books, {"C": Decimal("1000000")}, k=K, illiquid_floor=FLOOR)
    assert result.legs[0].fill.vwap == Decimal("45")
    assert result.realized_pnl > 0  # sold at 45 vs 30 entry
