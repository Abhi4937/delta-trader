"""Normalized live-account shapes (ADR 0004 §3). Decimal everywhere."""

from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal, InvalidOperation
from typing import Any


def _dec(value: Any) -> Decimal | None:
    if value is None or value == "":
        return None
    try:
        return Decimal(str(value))
    except (InvalidOperation, ValueError):
        return None


@dataclass(frozen=True)
class LivePosition:
    symbol: str
    product_id: int | None
    size: Decimal  # signed: long > 0, short < 0
    entry_price: Decimal | None
    mark_price: Decimal | None
    contract_size: Decimal
    margin: Decimal | None
    unrealized: Decimal | None

    def to_redis_mapping(self) -> dict[str, str]:
        out = {"symbol": self.symbol, "size": str(self.size)}
        if self.product_id is not None:
            out["product_id"] = str(self.product_id)
        for fld in ("entry_price", "mark_price", "contract_size", "margin", "unrealized"):
            v: Decimal | None = getattr(self, fld)
            if v is not None:
                out[fld] = str(v)
        return out


def normalize_position(
    raw: dict[str, Any], contract_size: Decimal = Decimal(1)
) -> LivePosition | None:
    """Normalize a Delta ``/v2/positions/margined`` row. Returns None if unusable."""
    product = raw.get("product") or {}
    symbol = raw.get("product_symbol") or product.get("symbol") or raw.get("symbol")
    if not symbol:
        return None
    pid = raw.get("product_id") or product.get("id")
    size = _dec(raw.get("size"))
    if size is None:
        return None
    cs = _dec(raw.get("contract_value")) or _dec(product.get("contract_value")) or contract_size
    return LivePosition(
        symbol=str(symbol),
        product_id=int(pid) if pid is not None else None,
        size=size,
        entry_price=_dec(raw.get("entry_price")),
        mark_price=_dec(raw.get("mark_price")),
        contract_size=cs or Decimal(1),
        margin=_dec(raw.get("margin")) or _dec(raw.get("position_margin")),
        unrealized=_dec(raw.get("unrealized_pnl")) or _dec(raw.get("unrealized_cashflow")),
    )
