"""Shared quant input view: a leg projected to the values the math needs.

Decoupled from ORM so the pure functions stay testable. ``signed_qty`` is the
**open** signed quantity (+ buy, - sell) used for MTM/Greeks.
"""

from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal


@dataclass(frozen=True)
class LegView:
    signed_qty: Decimal  # + for buy, - for sell (open qty for MTM)
    contract_size: Decimal
    entry_fill: Decimal  # per-contract entry price (incl. slippage)
    mark: Decimal | None = None
    delta: Decimal | None = None
    gamma: Decimal | None = None
    theta: Decimal | None = None
    vega: Decimal | None = None
    iv: Decimal | None = None

    @property
    def abs_notional(self) -> Decimal:
        return abs(self.signed_qty) * self.entry_fill * self.contract_size
