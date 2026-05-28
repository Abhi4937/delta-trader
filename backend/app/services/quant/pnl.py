"""PnL math for paper positions (ADR 0003 §3, §7). All Decimal.

- entry_cost  = sum signed_qty * fill_price * contract_size  (net debit +, credit -)
- unrealized  = sum signed_qty_open * (mark - entry_fill) * contract_size
- realized    = sum (exit_fill - entry_fill) * signed_qty_closed * contract_size
"""

from __future__ import annotations

from collections.abc import Sequence
from decimal import Decimal

from app.services.quant.types import LegView


def entry_cost(legs: Sequence[LegView]) -> Decimal:
    return sum(
        (leg.signed_qty * leg.entry_fill * leg.contract_size for leg in legs),
        Decimal(0),
    )


def unrealized_pnl(legs: Sequence[LegView]) -> Decimal:
    """Mark-to-market PnL on open legs. Legs with no mark contribute 0."""
    total = Decimal(0)
    for leg in legs:
        if leg.mark is None:
            continue
        total += leg.signed_qty * (leg.mark - leg.entry_fill) * leg.contract_size
    return total


def realized_pnl_slice(
    signed_qty_closed: Decimal,
    entry_fill: Decimal,
    exit_fill: Decimal,
    contract_size: Decimal,
) -> Decimal:
    """Realized PnL for one closed slice (signed_qty uses the entry sign)."""
    return (exit_fill - entry_fill) * signed_qty_closed * contract_size
