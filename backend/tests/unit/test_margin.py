"""Initial-margin estimate (ADR 0003 §8)."""

from __future__ import annotations

from decimal import Decimal

from app.services.paper.margin import MarginLeg, estimate_initial_margin


def _ml(sq: str, fill: str, is_call: bool, strike: str, cs: str = "1") -> MarginLeg:
    return MarginLeg(
        signed_qty=Decimal(sq),
        contract_size=Decimal(cs),
        fill_price=Decimal(fill),
        is_call=is_call,
        strike=Decimal(strike),
    )


def test_bull_call_spread_worst_loss_is_net_debit() -> None:
    # buy 100C @5, sell 110C @2 ; net debit 3 ; worst loss 3 ; short premium 2
    legs = [_ml("1", "5", True, "100"), _ml("-1", "2", True, "110")]
    margin = estimate_initial_margin(legs)
    # max(short_premium=2, 1.5 * worst_loss=3) = max(2, 4.5) = 4.5
    assert margin == Decimal("4.5")


def test_short_premium_dominates_for_long_only() -> None:
    # long single call: no short premium, worst loss = debit paid
    legs = [_ml("1", "5", True, "100")]
    margin = estimate_initial_margin(legs)
    assert margin == Decimal("7.5")  # 1.5 * 5


def test_short_straddle_margin_positive_and_large() -> None:
    # sell 100C @4, sell 100P @4 ; short premium 8 ; worst loss large on the grid
    legs = [_ml("-1", "4", True, "100"), _ml("-1", "4", False, "100")]
    margin = estimate_initial_margin(legs)
    assert margin > Decimal("8")  # buffer * worst-case dominates the premium
