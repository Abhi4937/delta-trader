"""End-to-end paper-engine flow against a live Postgres (skips if unreachable).

Exercises create -> execute -> MTM tick -> minute flush -> close with a fake REST
(canned L2 books) and a fake Redis bus. Runs locally when the dev Postgres is up;
auto-skips in CI (no DB).
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from decimal import Decimal
from typing import Any, cast

import asyncpg
import pytest
import pytest_asyncio
from sqlalchemy import select

from app.core.config import settings
from app.db.session import dispose_engine, get_sessionmaker
from app.models.paper import PaperFill, PaperLeg, PaperPosition
from app.services import redis_bus as redis_bus_mod
from app.services.paper.engine import PaperEngine
from app.services.paper.models import LegSpec, StrategySpec
from app.services.paper.mtm_worker import PaperMtmWorker
from tests.conftest import FakeBus

CALL = "C-BTC-99-TST"
PUT = "P-BTC-99-TST"


class FakeRest:
    async def get_l2_orderbook(self, symbol: str) -> dict[str, Any]:
        # Deep, liquid two-sided book.
        return {
            "buy": [{"price": "50", "size": "100"}, {"price": "49", "size": "100"}],
            "sell": [{"price": "52", "size": "100"}, {"price": "53", "size": "100"}],
        }

    async def get_candles(self, *a: Any, **k: Any) -> list[dict[str, Any]]:
        return []

    async def get_ticker(self, symbol: str) -> dict[str, Any]:
        return {"volume": "1000", "mark_price": "50"}

    async def aclose(self) -> None:
        return None


async def _db_up() -> bool:
    try:
        conn = await asyncpg.connect(settings.pg_dsn_sync, timeout=2)
        await conn.close()
        return True
    except Exception:
        return False


@pytest_asyncio.fixture
async def engine_and_bus() -> Any:
    if not await _db_up():
        pytest.skip("Postgres not reachable")
    bus = FakeBus()
    eng = PaperEngine(rest=FakeRest(), bus=cast(redis_bus_mod.RedisBus, bus))
    created: list[int] = []
    yield eng, bus, created
    # cleanup created positions + their strategies
    conn = await asyncpg.connect(settings.pg_dsn_sync)
    try:
        for pid in created:
            row = await conn.fetchrow("SELECT strategy_id FROM paper_positions WHERE id=$1", pid)
            await conn.execute("DELETE FROM paper_positions WHERE id=$1", pid)
            if row:
                await conn.execute("DELETE FROM strategies WHERE id=$1", row["strategy_id"])
    finally:
        await conn.close()
    await dispose_engine()


@pytest.mark.integration
async def test_full_paper_flow(engine_and_bus: Any) -> None:
    eng, bus, created = engine_and_bus
    spec = StrategySpec(
        name="test-straddle",
        legs=[
            LegSpec(symbol=CALL, side="sell", qty=Decimal("1")),
            LegSpec(symbol=PUT, side="sell", qty=Decimal("1")),
        ],
    )

    # --- execute ---
    position_id = await eng.execute(spec)
    created.append(position_id)

    sessionmaker = get_sessionmaker()
    async with sessionmaker() as session:
        pos = await session.get(PaperPosition, position_id)
        assert pos is not None and pos.status == "open"
        legs = (
            (await session.execute(select(PaperLeg).where(PaperLeg.position_id == position_id)))
            .scalars()
            .all()
        )
        assert len(legs) == 2
        leg_ids = [leg.id for leg in legs]
        fills = (
            (await session.execute(select(PaperFill).where(PaperFill.leg_id.in_(leg_ids))))
            .scalars()
            .all()
        )
        assert len(fills) >= 2
    # both legs sold => net credit
    assert pos.entry_cost < 0
    assert pos.margin_estimate > 0

    # --- MTM tick + minute flush ---
    for sym in (CALL, PUT):
        await bus.set_latest(
            f"latest:{sym}",
            {
                "mark_price": "45",
                "delta": "-0.5",
                "gamma": "0.001",
                "theta": "1",
                "vega": "2",
                "iv": "0.6",
            },
        )
    worker = PaperMtmWorker(bus=cast(redis_bus_mod.RedisBus, bus))
    await worker._reload()
    now = datetime.now(tz=UTC)
    await worker._tick(now)
    snap = await bus.get_latest(f"paper:mtm:{position_id}")
    assert snap and "total_pnl" in snap
    # sold @ ~51 (with impact), marks dropped to 45 => short profit (positive unrealized)
    assert Decimal(snap["unrealized_pnl"]) > 0

    # force a closed minute and flush to the hypertable
    await worker._tick(now + timedelta(seconds=1))
    await worker._flush(now + timedelta(minutes=1, seconds=5))
    conn = await asyncpg.connect(settings.pg_dsn_sync)
    try:
        cnt = await conn.fetchval(
            "SELECT count(*) FROM paper_mtm_minute WHERE position_id=$1", position_id
        )
    finally:
        await conn.close()
    assert cnt >= 1

    # --- close (full) ---
    result = await eng.close(position_id, None)
    assert result["status"] == "closed"
    async with sessionmaker() as session:
        pos2 = await session.get(PaperPosition, position_id)
        assert pos2 is not None and pos2.status == "closed"
