r"""Orderbook-walk + linear-impact slippage model (ADR 0003 §2).

For a market order of ``qty`` contracts:
- **buy** walks the asks (ascending price), **sell** walks the bids (descending).
- ``vwap`` = size-weighted average price of the consumed levels.
- linear impact penalty: ``impact = vwap * k * notional / vol_24h`` where
  ``notional = vwap * qty * contract_size``. Buy pays up (``+impact``), sell
  receives less (``-impact``). When 24h volume is unknown/zero the book is treated
  as illiquid and a fixed ``illiquid_floor`` fraction is applied instead of
  dividing by zero.

All arithmetic is ``Decimal``; floats never touch a fill price (CLAUDE.md rule #3).
"""

from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal
from typing import Literal

Side = Literal["buy", "sell"]


class InsufficientDepthError(RuntimeError):
    """Raised when the visible book cannot fill the requested size."""


@dataclass(frozen=True)
class Level:
    price: Decimal
    size: Decimal


@dataclass(frozen=True)
class OrderBook:
    bids: list[Level]  # any order; sorted internally
    asks: list[Level]


@dataclass(frozen=True)
class Fill:
    side: Side
    qty: Decimal
    vwap: Decimal
    impact: Decimal
    fill_price: Decimal
    consumed: list[tuple[str, str]]  # (price, size) Decimal-as-strings, audit


def walk_book(levels: list[Level], qty: Decimal) -> tuple[Decimal, list[tuple[str, str]]]:
    """Consume ``levels`` (already in walk order) for ``qty``; return (vwap, consumed).

    Raises ``InsufficientDepthError`` if the levels cannot cover ``qty``.
    """
    if qty <= 0:
        raise ValueError("qty must be > 0")
    remaining = qty
    cost = Decimal(0)
    consumed: list[tuple[str, str]] = []
    for lvl in levels:
        if remaining <= 0:
            break
        take = min(lvl.size, remaining)
        cost += lvl.price * take
        consumed.append((str(lvl.price), str(take)))
        remaining -= take
    if remaining > 0:
        raise InsufficientDepthError(f"book depth {qty - remaining} < requested {qty}")
    vwap = cost / qty
    return vwap, consumed


def impact_fraction(
    notional: Decimal,
    vol_24h: Decimal | None,
    k: Decimal,
    illiquid_floor: Decimal,
) -> Decimal:
    """Dimensionless impact fraction ``k * notional / vol_24h`` (illiquid floor)."""
    if vol_24h is None or vol_24h <= 0:
        return illiquid_floor
    frac = k * notional / vol_24h
    return min(max(frac, Decimal(0)), illiquid_floor) if frac > illiquid_floor else frac


def compute_fill(
    side: Side,
    qty: Decimal,
    book: OrderBook,
    contract_size: Decimal,
    vol_24h: Decimal | None,
    k: Decimal,
    illiquid_floor: Decimal,
) -> Fill:
    """Walk the relevant side of ``book`` and apply linear impact."""
    if side == "buy":
        levels = sorted(book.asks, key=lambda x: x.price)
    else:
        levels = sorted(book.bids, key=lambda x: x.price, reverse=True)

    vwap, consumed = walk_book(levels, qty)
    notional = vwap * qty * contract_size
    frac = impact_fraction(notional, vol_24h, k, illiquid_floor)
    impact = vwap * frac
    fill_price = vwap + impact if side == "buy" else vwap - impact
    # A sell fill can never go below zero from impact.
    if fill_price < 0:
        fill_price = Decimal(0)
    return Fill(
        side=side,
        qty=qty,
        vwap=vwap,
        impact=impact,
        fill_price=fill_price,
        consumed=consumed,
    )
