"""User-driven strategy grouping (ADR 0004 §4): tag positions into a named
strategy. NO auto-clustering — the user owns the grouping."""

from __future__ import annotations

from collections.abc import Sequence

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.db.session import get_sessionmaker
from app.models.live import LiveStrategy, LiveStrategyPosition


class PositionAlreadyTaggedError(RuntimeError):
    """A position is already tagged to a strategy (one strategy per symbol)."""


async def create_strategy(name: str, symbols: Sequence[str]) -> int:
    sessionmaker = get_sessionmaker()
    async with sessionmaker() as session, session.begin():
        strat = LiveStrategy(name=name)
        session.add(strat)
        await session.flush()
        for symbol in symbols:
            session.add(LiveStrategyPosition(strategy_id=strat.id, symbol=symbol))
        try:
            await session.flush()
        except IntegrityError as exc:
            raise PositionAlreadyTaggedError(str(exc)) from exc
        return int(strat.id)


async def list_strategies() -> list[dict[str, object]]:
    sessionmaker = get_sessionmaker()
    async with sessionmaker() as session:
        strats = (await session.execute(select(LiveStrategy))).scalars().all()
        out: list[dict[str, object]] = []
        for s in strats:
            symbols = (
                (
                    await session.execute(
                        select(LiveStrategyPosition.symbol).where(
                            LiveStrategyPosition.strategy_id == s.id
                        )
                    )
                )
                .scalars()
                .all()
            )
            out.append(
                {"id": s.id, "name": s.name, "created_at": s.created_at, "symbols": list(symbols)}
            )
        return out


async def strategy_symbols(strategy_id: int) -> list[str]:
    sessionmaker = get_sessionmaker()
    async with sessionmaker() as session:
        return list(
            (
                await session.execute(
                    select(LiveStrategyPosition.symbol).where(
                        LiveStrategyPosition.strategy_id == strategy_id
                    )
                )
            )
            .scalars()
            .all()
        )
