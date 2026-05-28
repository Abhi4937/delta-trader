"""Initial margin estimate (ADR 0003 §8). Estimate only — not exchange-true.

``margin = max(short_premium_received, 1.5 * worst_case_loss)`` where worst-case
loss is the most negative expiry PnL over a strike grid.
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from decimal import Decimal
from itertools import pairwise

from app.services.paper.models import LegFill, parse_option_symbol

_BUFFER = Decimal("1.5")


@dataclass(frozen=True)
class MarginLeg:
    signed_qty: Decimal
    contract_size: Decimal
    fill_price: Decimal
    is_call: bool | None  # None = non-option (linear)
    strike: Decimal | None


def _intrinsic(is_call: bool | None, strike: Decimal | None, spot: Decimal) -> Decimal:
    if is_call is None or strike is None:
        return spot  # linear instrument (future)
    if is_call:
        return max(spot - strike, Decimal(0))
    return max(strike - spot, Decimal(0))


def margin_legs_from_fills(legs: Sequence[LegFill]) -> list[MarginLeg]:
    out: list[MarginLeg] = []
    for leg in legs:
        opt = parse_option_symbol(leg.symbol)
        is_call, strike = (opt[0], opt[1]) if opt else (None, None)
        out.append(
            MarginLeg(
                signed_qty=leg.signed_qty,
                contract_size=leg.contract_size,
                fill_price=leg.fill.fill_price,
                is_call=is_call,
                strike=strike,
            )
        )
    return out


def _strike_grid(legs: Sequence[MarginLeg]) -> list[Decimal]:
    strikes = sorted({leg.strike for leg in legs if leg.strike is not None})
    if not strikes:
        return [Decimal(0)]
    grid = [Decimal(0), *strikes, strikes[-1] * 2]
    # midpoints between strikes catch interior kinks
    mids = [(a + b) / 2 for a, b in pairwise(grid)]
    return sorted(set(grid + mids))


def estimate_initial_margin(legs: Sequence[MarginLeg]) -> Decimal:
    short_premium = sum(
        (
            leg.fill_price * abs(leg.signed_qty) * leg.contract_size
            for leg in legs
            if leg.signed_qty < 0
        ),
        Decimal(0),
    )
    worst_pnl = Decimal(0)
    seen = False
    for spot in _strike_grid(legs):
        pnl = sum(
            (
                leg.signed_qty
                * leg.contract_size
                * (_intrinsic(leg.is_call, leg.strike, spot) - leg.fill_price)
                for leg in legs
            ),
            Decimal(0),
        )
        if not seen or pnl < worst_pnl:
            worst_pnl = pnl
            seen = True
    worst_case_loss = -worst_pnl if worst_pnl < 0 else Decimal(0)
    return max(short_premium, _BUFFER * worst_case_loss)
