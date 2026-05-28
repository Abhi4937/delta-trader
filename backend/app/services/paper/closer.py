"""Close execution: reverse-walk the book per leg, realize PnL (ADR 0003 §7).

Closing a long (entry side ``buy``) sells into the bids; closing a short (entry
side ``sell``) buys back from the asks. Same VWAP-walk + impact as entry.
``InsufficientDepthError`` aborts the close (position unchanged).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from decimal import Decimal

from app.services.paper.models import Side, signed_qty
from app.services.quant.pnl import realized_pnl_slice
from app.services.quant.slippage import Fill, OrderBook, compute_fill


@dataclass(frozen=True)
class CloseLeg:
    leg_id: int
    symbol: str
    entry_side: Side  # original side
    qty_close: Decimal
    contract_size: Decimal
    entry_fill: Decimal


@dataclass(frozen=True)
class ClosedLeg:
    leg_id: int
    qty_close: Decimal
    fill: Fill
    realized: Decimal


@dataclass
class CloseResult:
    legs: list[ClosedLeg] = field(default_factory=list)
    realized_pnl: Decimal = Decimal(0)


def execute_close(
    close_legs: list[CloseLeg],
    books: dict[str, OrderBook],
    vol24h: dict[str, Decimal | None],
    *,
    k: Decimal,
    illiquid_floor: Decimal,
) -> CloseResult:
    result = CloseResult()
    for cl in close_legs:
        close_side: Side = "sell" if cl.entry_side == "buy" else "buy"
        fill = compute_fill(
            side=close_side,
            qty=cl.qty_close,
            book=books[cl.symbol],
            contract_size=cl.contract_size,
            vol_24h=vol24h.get(cl.symbol),
            k=k,
            illiquid_floor=illiquid_floor,
        )
        sq_closed = signed_qty(cl.entry_side, cl.qty_close)  # original entry sign
        realized = realized_pnl_slice(
            signed_qty_closed=sq_closed,
            entry_fill=cl.entry_fill,
            exit_fill=fill.fill_price,
            contract_size=cl.contract_size,
        )
        result.legs.append(
            ClosedLeg(leg_id=cl.leg_id, qty_close=cl.qty_close, fill=fill, realized=realized)
        )
        result.realized_pnl += realized
    return result
