"""Strategy-level Greek aggregation (ADR 0003 §4).

``net_g = Σ signed_qty * contract_size * leg_g`` over legs that have the greek.
Sell legs carry negative ``signed_qty`` so shorts subtract correctly.
"""

from __future__ import annotations

from collections.abc import Sequence
from decimal import Decimal

from app.services.quant.types import LegView

GREEK_FIELDS = ("delta", "gamma", "theta", "vega")


def net_signed_greeks(legs: Sequence[LegView]) -> dict[str, Decimal]:
    out: dict[str, Decimal] = {g: Decimal(0) for g in GREEK_FIELDS}
    for leg in legs:
        for g in GREEK_FIELDS:
            val: Decimal | None = getattr(leg, g)
            if val is not None:
                out[g] += leg.signed_qty * leg.contract_size * val
    return out
