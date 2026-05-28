"""Entry execution: walk each leg's L2 book, apply impact, aggregate (ADR 0003 §2).

Pure given the fetched market data (books / contract sizes / 24h volumes), so it
is unit-testable without network. ``InsufficientDepthError`` from any leg aborts an
atomic entry (the engine maps it to a 409).
"""

from __future__ import annotations

from decimal import Decimal

from app.services.paper.margin import estimate_initial_margin, margin_legs_from_fills
from app.services.paper.models import ExecutionResult, LegFill, StrategySpec
from app.services.quant.slippage import OrderBook, compute_fill


def execute_entry(
    spec: StrategySpec,
    books: dict[str, OrderBook],
    contract_sizes: dict[str, Decimal],
    vol24h: dict[str, Decimal | None],
    product_ids: dict[str, int | None],
    *,
    k: Decimal,
    illiquid_floor: Decimal,
) -> ExecutionResult:
    """Walk every leg. Raises ``InsufficientDepthError`` if any leg can't fill."""
    result = ExecutionResult()
    for leg in spec.legs:
        cs = contract_sizes.get(leg.symbol, Decimal(1))
        book = books[leg.symbol]
        fill = compute_fill(
            side=leg.side,
            qty=leg.qty,
            book=book,
            contract_size=cs,
            vol_24h=vol24h.get(leg.symbol),
            k=k,
            illiquid_floor=illiquid_floor,
        )
        result.legs.append(
            LegFill(
                symbol=leg.symbol,
                side=leg.side,
                qty=leg.qty,
                contract_size=cs,
                product_id=product_ids.get(leg.symbol),
                fill=fill,
            )
        )
    result.entry_cost = sum(
        (lf.signed_qty * lf.fill.fill_price * lf.contract_size for lf in result.legs),
        Decimal(0),
    )
    result.margin_estimate = estimate_initial_margin(margin_legs_from_fills(result.legs))
    return result
