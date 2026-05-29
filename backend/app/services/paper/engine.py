"""Paper engine orchestration (ADR 0003 §2, §7, §11).

Wires market-data fetch (REST L2 + Redis marks) to the pure executor/closer,
persists strategies/positions/legs/fills via SQLAlchemy, writes the audit log, and
publishes ``paper:events`` so the MTM worker refreshes its position cache.
"""

from __future__ import annotations

import asyncio
import json
from datetime import UTC, datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import select, text

from app.core import metrics
from app.core.config import settings
from app.core.logging import logger
from app.db.session import get_sessionmaker
from app.models.paper import PaperFill, PaperLeg, PaperPosition, Strategy
from app.models.product import Product
from app.services.paper import closer as closer_mod
from app.services.paper.executor import execute_entry
from app.services.paper.models import ExecutionResult, StrategySpec, signed_qty
from app.services.quant.pnl import realized_pnl_slice
from app.services.quant.slippage import InsufficientDepthError, Level, OrderBook
from app.services.redis_bus import RedisBus, get_bus


def parse_l2(result: dict[str, Any]) -> OrderBook:
    """Delta ``/v2/l2orderbook`` result -> OrderBook (buy=bids, sell=asks)."""

    def levels(rows: list[dict[str, Any]] | None) -> list[Level]:
        out: list[Level] = []
        for r in rows or []:
            try:
                out.append(Level(price=Decimal(str(r["price"])), size=Decimal(str(r["size"]))))
            except (KeyError, ArithmeticError):
                continue
        return out

    return OrderBook(bids=levels(result.get("buy")), asks=levels(result.get("sell")))


class PaperEngine:
    def __init__(self, rest: Any, bus: RedisBus | None = None) -> None:
        self._rest = rest
        self._bus = bus or get_bus()
        self._k = Decimal(str(settings.paper_impact_k))
        self._floor = Decimal(str(settings.paper_impact_illiquid_floor))

    # --- market data ------------------------------------------------------
    async def _fetch_market(
        self, symbols: list[str]
    ) -> tuple[
        dict[str, OrderBook], dict[str, Decimal], dict[str, Decimal | None], dict[str, int | None]
    ]:
        books: dict[str, OrderBook] = {}
        contract_sizes: dict[str, Decimal] = {}
        vol24h: dict[str, Decimal | None] = {}
        product_ids: dict[str, int | None] = {}

        sessionmaker = get_sessionmaker()
        async with sessionmaker() as session:
            rows = (
                (await session.execute(select(Product).where(Product.symbol.in_(symbols))))
                .scalars()
                .all()
            )
            by_symbol = {p.symbol: p for p in rows}

        async def fetch_one(
            symbol: str,
        ) -> tuple[str, OrderBook, Decimal, Decimal | None, int | None]:
            # A symbol whose L2 book can't be fetched (404 / Delta error) has no
            # tradeable depth -> empty book -> compute_fill raises InsufficientDepth
            # -> the API returns a clean 409 instead of an unhandled 500.
            try:
                raw = await self._rest.get_l2_orderbook(symbol)
            except Exception as exc:
                logger.warning("l2 fetch failed; no depth", symbol=symbol, error=str(exc))
                raw = {}
            book = parse_l2(raw if isinstance(raw, dict) else {})
            prod = by_symbol.get(symbol)
            cs = prod.contract_size if prod and prod.contract_size is not None else Decimal(1)
            vol = await self._vol_24h(symbol, cs)
            return symbol, book, cs, vol, (prod.product_id if prod else None)

        results = await asyncio.gather(*(fetch_one(s) for s in symbols))
        for symbol, book, cs, vol, pid in results:
            books[symbol] = book
            contract_sizes[symbol] = cs
            vol24h[symbol] = vol
            product_ids[symbol] = pid
        return books, contract_sizes, vol24h, product_ids

    async def _vol_24h(self, symbol: str, cs: Decimal) -> Decimal | None:
        """24h traded notional: Redis turnover/volume first, then a REST ticker
        fallback (ADR 0003 §2). None -> the slippage model applies the illiquid floor.
        """
        snap = await self._bus.get_latest(f"latest:{symbol}")
        turnover = snap.get("turnover")
        if turnover:
            return Decimal(turnover)
        vol, mark = snap.get("volume"), snap.get("mark_price")
        if vol and mark:
            return Decimal(vol) * Decimal(mark) * cs
        try:
            t = await self._rest.get_ticker(symbol)
        except Exception as exc:
            logger.warning("ticker vol fallback failed", symbol=symbol, error=str(exc))
            return None
        if isinstance(t, dict):
            if t.get("turnover"):
                return Decimal(str(t["turnover"]))
            if t.get("volume") and t.get("mark_price"):
                return Decimal(str(t["volume"])) * Decimal(str(t["mark_price"])) * cs
        return None

    # --- create / execute -------------------------------------------------
    async def create_strategy(self, spec: StrategySpec) -> int:
        sessionmaker = get_sessionmaker()
        async with sessionmaker() as session, session.begin():
            row = Strategy(
                name=spec.name, underlying=spec.underlying, spec=spec.model_dump(mode="json")
            )
            session.add(row)
            await session.flush()
            return int(row.id)

    async def preview(self, spec: StrategySpec) -> ExecutionResult:
        symbols = [leg.symbol for leg in spec.legs]
        books, cs, vol, pids = await self._fetch_market(symbols)
        return execute_entry(spec, books, cs, vol, pids, k=self._k, illiquid_floor=self._floor)

    async def execute(self, spec: StrategySpec, strategy_id: int | None = None) -> int:
        if strategy_id is None:
            strategy_id = await self.create_strategy(spec)
        result = await self.preview(spec)  # raises InsufficientDepthError on thin book

        sessionmaker = get_sessionmaker()
        async with sessionmaker() as session, session.begin():
            pos = PaperPosition(
                strategy_id=strategy_id,
                underlying=spec.underlying,
                status="open",
                entry_cost=result.entry_cost,
                realized_pnl=Decimal(0),
                margin_estimate=result.margin_estimate,
                flags={"margin": "estimate"},
            )
            session.add(pos)
            await session.flush()
            for lf in result.legs:
                leg = PaperLeg(
                    position_id=pos.id,
                    symbol=lf.symbol,
                    product_id=lf.product_id,
                    side=lf.side,
                    qty=lf.qty,
                    qty_open=lf.qty,
                    contract_size=lf.contract_size,
                    entry_fill=lf.fill.fill_price,
                    status="open",
                )
                session.add(leg)
                await session.flush()
                session.add(
                    PaperFill(
                        leg_id=leg.id,
                        kind="entry",
                        side=lf.side,
                        qty=lf.qty,
                        vwap=lf.fill.vwap,
                        impact=lf.fill.impact,
                        fill_price=lf.fill.fill_price,
                        book_snapshot={"consumed": lf.fill.consumed},
                    )
                )
            pos_id = int(pos.id)
        await self._event(pos_id, "executed", {"entry_cost": str(result.entry_cost)})
        await self._bus.publish("paper:events", f"executed:{pos_id}")
        metrics.paper_strategies_executed.inc()
        logger.info("paper position executed", position_id=pos_id, legs=len(result.legs))
        return pos_id

    # --- close ------------------------------------------------------------
    async def close(self, position_id: int, leg_qtys: dict[int, Decimal] | None) -> dict[str, Any]:
        sessionmaker = get_sessionmaker()
        async with sessionmaker() as session:
            legs = (
                (await session.execute(select(PaperLeg).where(PaperLeg.position_id == position_id)))
                .scalars()
                .all()
            )
        if not legs:
            raise ValueError(f"position {position_id} not found")

        close_legs: list[closer_mod.CloseLeg] = []
        for leg in legs:
            if leg.qty_open <= 0:
                continue
            qty = leg_qtys.get(leg.id, leg.qty_open) if leg_qtys else leg.qty_open
            qty = min(qty, leg.qty_open)
            if qty <= 0:
                continue
            close_legs.append(
                closer_mod.CloseLeg(
                    leg_id=int(leg.id),
                    symbol=leg.symbol,
                    entry_side=leg.side,  # type: ignore[arg-type]
                    qty_close=qty,
                    contract_size=leg.contract_size,
                    entry_fill=leg.entry_fill,
                )
            )
        if not close_legs:
            raise ValueError("nothing to close")

        symbols = [cl.symbol for cl in close_legs]
        books, _cs, vol, _pids = await self._fetch_market(symbols)
        result = closer_mod.execute_close(
            close_legs, books, vol, k=self._k, illiquid_floor=self._floor
        )

        by_leg = {cl.leg_id: cl for cl in close_legs}
        closed_map = {c.leg_id: c for c in result.legs}
        realized_added = Decimal(0)
        async with sessionmaker() as session, session.begin():
            pos = await session.get(PaperPosition, position_id)
            if pos is None:
                raise ValueError("position vanished")
            # Re-read legs with a row lock so a concurrent close can't drive
            # qty_open negative or double-count realized PnL (TOCTOU guard).
            fresh = (
                (
                    await session.execute(
                        select(PaperLeg)
                        .where(PaperLeg.position_id == position_id)
                        .with_for_update()
                    )
                )
                .scalars()
                .all()
            )
            for leg in fresh:
                c = closed_map.get(int(leg.id))
                if c is None:
                    continue
                # Clamp to what is actually still open at write time.
                actual = min(c.qty_close, leg.qty_open)
                if actual <= 0:
                    continue
                leg.qty_open = leg.qty_open - actual
                leg.exit_fill = c.fill.fill_price
                leg.status = "closed" if leg.qty_open <= 0 else "partially_closed"
                realized_added += realized_pnl_slice(
                    signed_qty_closed=signed_qty(by_leg[int(leg.id)].entry_side, actual),
                    entry_fill=leg.entry_fill,
                    exit_fill=c.fill.fill_price,
                    contract_size=leg.contract_size,
                )
                session.add(
                    PaperFill(
                        leg_id=leg.id,
                        kind="close",
                        side=by_leg[int(leg.id)].entry_side,
                        qty=actual,
                        vwap=c.fill.vwap,
                        impact=c.fill.impact,
                        fill_price=c.fill.fill_price,
                        book_snapshot={"consumed": c.fill.consumed},
                    )
                )
            pos.realized_pnl = pos.realized_pnl + realized_added
            all_closed = all(leg.qty_open <= 0 for leg in fresh)
            if all_closed:
                pos.status = "closed"
                pos.closed_at = datetime.now(tz=UTC)
            else:
                pos.status = "partially_closed"
            status = pos.status
            realized_total = pos.realized_pnl

        await self._event(position_id, "closed" if all_closed else "partial_close", {})
        await self._bus.publish("paper:events", f"closed:{position_id}")
        return {"status": status, "realized_pnl": realized_total}

    # --- audit ------------------------------------------------------------
    async def _event(self, position_id: int | None, kind: str, detail: dict[str, Any]) -> None:
        sessionmaker = get_sessionmaker()
        async with sessionmaker() as session, session.begin():
            await session.execute(
                text(
                    "INSERT INTO paper_events (position_id, kind, detail) "
                    "VALUES (:pid, :kind, CAST(:detail AS jsonb))"
                ),
                {"pid": position_id, "kind": kind, "detail": json.dumps(detail)},
            )


__all__ = ["InsufficientDepthError", "PaperEngine", "parse_l2"]
