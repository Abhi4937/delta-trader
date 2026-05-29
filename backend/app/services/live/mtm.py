"""Aggregated live MTM over a tagged strategy (ADR 0004 §3, §4).

Reuses the paper quant primitives unchanged via a LivePosition -> LegView adapter.
Marks/greeks come from the public Redis ``latest:{symbol}`` snapshots; the live
position supplies signed size + entry price.
"""

from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal

from app.services.live.types import _dec
from app.services.quant.greeks import net_signed_greeks
from app.services.quant.iv import strategy_iv
from app.services.quant.pnl import unrealized_pnl
from app.services.quant.types import LegView
from app.services.redis_bus import RedisBus, get_bus


@dataclass
class LiveAggregate:
    unrealized_pnl: Decimal
    realized_pnl: Decimal  # exchange realized is out of scope; 0 for the live view
    total_pnl: Decimal
    net_delta: Decimal
    net_gamma: Decimal
    net_theta: Decimal
    net_vega: Decimal
    strategy_iv: Decimal | None
    margin: Decimal
    mark_stale: bool


async def aggregate(symbols: list[str], bus: RedisBus | None = None) -> LiveAggregate:
    bus = bus or get_bus()
    views: list[LegView] = []
    margin = Decimal(0)
    mark_stale = False
    for symbol in symbols:
        pos = await bus.get_latest(f"live:position:{symbol}")
        if not pos:
            mark_stale = True
            continue
        size = _dec(pos.get("size")) or Decimal(0)
        if size == 0:
            continue
        cs = _dec(pos.get("contract_size")) or Decimal(1)
        entry = _dec(pos.get("entry_price")) or Decimal(0)
        margin += _dec(pos.get("margin")) or Decimal(0)
        tick = await bus.get_latest(f"latest:{symbol}")
        mark = _dec(tick.get("mark_price")) or _dec(pos.get("mark_price"))
        if mark is None:
            mark_stale = True
        views.append(
            LegView(
                signed_qty=size,
                contract_size=cs,
                entry_fill=entry,
                mark=mark,
                delta=_dec(tick.get("delta")),
                gamma=_dec(tick.get("gamma")),
                theta=_dec(tick.get("theta")),
                vega=_dec(tick.get("vega")),
                iv=_dec(tick.get("iv")),
            )
        )
    unreal = unrealized_pnl(views)
    greeks = net_signed_greeks(views)
    return LiveAggregate(
        unrealized_pnl=unreal,
        realized_pnl=Decimal(0),
        total_pnl=unreal,
        net_delta=greeks["delta"],
        net_gamma=greeks["gamma"],
        net_theta=greeks["theta"],
        net_vega=greeks["vega"],
        strategy_iv=strategy_iv(views),
        margin=margin,
        mark_stale=mark_stale,
    )
