"""Paper-engine DTOs + execution-result shapes (ADR 0003 §1).

Input DTOs are pydantic (validated at the API boundary); execution results are
plain dataclasses passed between executor/closer/engine. ORM rows live in
``app.models.paper``.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, Field, field_validator

from app.services.quant.slippage import Fill

Side = Literal["buy", "sell"]


class LegSpec(BaseModel):
    symbol: str
    side: Side
    qty: Decimal = Field(gt=0)

    @field_validator("qty", mode="before")
    @classmethod
    def _to_decimal(cls, v: object) -> Decimal:
        return Decimal(str(v))


class StrategySpec(BaseModel):
    name: str
    underlying: str = "BTC"
    legs: list[LegSpec] = Field(min_length=1)
    atomic: bool = True
    note: str | None = None


def signed_qty(side: Side, qty: Decimal) -> Decimal:
    return qty if side == "buy" else -qty


def parse_option_symbol(symbol: str) -> tuple[bool, Decimal] | None:
    """``C-BTC-90000-290526`` -> (is_call=True, strike=90000). None for non-options."""
    parts = symbol.split("-")
    if len(parts) < 4 or parts[0] not in ("C", "P"):
        return None
    try:
        return parts[0] == "C", Decimal(parts[2])
    except (IndexError, ArithmeticError):
        return None


@dataclass(frozen=True)
class LegFill:
    symbol: str
    side: Side
    qty: Decimal
    contract_size: Decimal
    product_id: int | None
    fill: Fill

    @property
    def signed_qty(self) -> Decimal:
        return signed_qty(self.side, self.qty)


@dataclass
class ExecutionResult:
    legs: list[LegFill] = field(default_factory=list)
    entry_cost: Decimal = Decimal(0)
    margin_estimate: Decimal = Decimal(0)
