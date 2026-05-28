"""Per-second MTM worker (ADR 0003 §3, §11).

Every 1 s: for each open position, read leg marks from Redis ``latest:{symbol}``,
compute unrealized PnL / net Greeks / strategy IV, write ``paper:mtm:{id}`` and
publish ``paper:position:{id}``. Every 5 s: flush closed minute buckets to
``paper_mtm_minute`` (COPY + idempotent upsert). The open-position cache is
rebuilt from Postgres every 5 s (and on boot — crash recovery).
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass
from datetime import UTC, datetime
from decimal import Decimal

import asyncpg
from sqlalchemy import select

from app.core.config import settings
from app.core.logging import logger
from app.db.session import get_sessionmaker
from app.models.paper import PaperLeg, PaperPosition
from app.services.paper.models import signed_qty
from app.services.quant.greeks import net_signed_greeks
from app.services.quant.iv import strategy_iv
from app.services.quant.pnl import unrealized_pnl
from app.services.quant.types import LegView
from app.services.redis_bus import RedisBus, get_bus

_MTM_COLUMNS = (
    "position_id",
    "ts",
    "open",
    "high",
    "low",
    "close",
    "unrealized_pnl",
    "realized_pnl",
    "net_delta",
    "net_gamma",
    "net_theta",
    "net_vega",
    "strategy_iv",
    "mark_stale",
)

_UPSERT_SQL = f"""
INSERT INTO paper_mtm_minute ({", ".join(_MTM_COLUMNS)})
SELECT {", ".join(_MTM_COLUMNS)} FROM _staging_pmtm
ON CONFLICT (position_id, ts) DO UPDATE SET
  open=EXCLUDED.open, high=EXCLUDED.high, low=EXCLUDED.low, close=EXCLUDED.close,
  unrealized_pnl=EXCLUDED.unrealized_pnl, realized_pnl=EXCLUDED.realized_pnl,
  net_delta=EXCLUDED.net_delta, net_gamma=EXCLUDED.net_gamma,
  net_theta=EXCLUDED.net_theta, net_vega=EXCLUDED.net_vega,
  strategy_iv=EXCLUDED.strategy_iv, mark_stale=EXCLUDED.mark_stale;
"""


@dataclass
class _PosCache:
    position_id: int
    realized_pnl: Decimal
    legs: list[tuple[str, str, Decimal, Decimal, Decimal]]  # symbol, side, qty_open, cs, entry_fill


@dataclass
class _MtmAcc:
    position_id: int
    ts: datetime
    open: Decimal
    high: Decimal
    low: Decimal
    close: Decimal
    unrealized_pnl: Decimal
    realized_pnl: Decimal
    net_delta: Decimal
    net_gamma: Decimal
    net_theta: Decimal
    net_vega: Decimal
    strategy_iv: Decimal | None
    mark_stale: bool

    def update(self, total: Decimal, snap: dict[str, Decimal | None | bool]) -> None:
        self.high = max(self.high, total)
        self.low = min(self.low, total)
        self.close = total
        self.unrealized_pnl = snap["unrealized_pnl"]  # type: ignore[assignment]
        self.realized_pnl = snap["realized_pnl"]  # type: ignore[assignment]
        self.net_delta = snap["net_delta"]  # type: ignore[assignment]
        self.net_gamma = snap["net_gamma"]  # type: ignore[assignment]
        self.net_theta = snap["net_theta"]  # type: ignore[assignment]
        self.net_vega = snap["net_vega"]  # type: ignore[assignment]
        self.strategy_iv = snap["strategy_iv"]  # type: ignore[assignment]
        self.mark_stale = bool(snap["mark_stale"])


def _minute(ts: datetime) -> datetime:
    return ts.astimezone(UTC).replace(second=0, microsecond=0)


def _d(v: str | None) -> Decimal | None:
    if v is None or v == "":
        return None
    try:
        return Decimal(v)
    except ArithmeticError:
        return None


class PaperMtmWorker:
    def __init__(self, bus: RedisBus | None = None, dsn: str | None = None) -> None:
        self._bus = bus or get_bus()
        self._dsn = dsn or settings.pg_dsn_sync
        self._running = False
        self._cache: dict[int, _PosCache] = {}
        self._buf: dict[tuple[int, datetime], _MtmAcc] = {}

    async def run(self) -> None:
        self._running = True
        await self._reload()
        logger.info("paper mtm worker started", positions=len(self._cache))
        elapsed = 0
        while self._running:
            await asyncio.sleep(1)
            elapsed += 1
            try:
                await self._tick(datetime.now(tz=UTC))
            except Exception as exc:  # keep the worker alive
                logger.warning("paper mtm tick failed", error=str(exc))
            if elapsed % 5 == 0:
                try:
                    await self._reload()
                    await self._flush(datetime.now(tz=UTC))
                except Exception as exc:
                    logger.warning("paper mtm flush/reload failed", error=str(exc))

    def stop(self) -> None:
        self._running = False

    async def _reload(self) -> None:
        sessionmaker = get_sessionmaker()
        async with sessionmaker() as session:
            positions = (
                (
                    await session.execute(
                        select(PaperPosition).where(
                            PaperPosition.status.in_(["open", "partially_closed"])
                        )
                    )
                )
                .scalars()
                .all()
            )
            cache: dict[int, _PosCache] = {}
            for pos in positions:
                legs = (
                    (await session.execute(select(PaperLeg).where(PaperLeg.position_id == pos.id)))
                    .scalars()
                    .all()
                )
                cache[int(pos.id)] = _PosCache(
                    position_id=int(pos.id),
                    realized_pnl=pos.realized_pnl,
                    legs=[
                        (leg.symbol, leg.side, leg.qty_open, leg.contract_size, leg.entry_fill)
                        for leg in legs
                        if leg.qty_open > 0
                    ],
                )
        self._cache = cache

    async def _tick(self, now: datetime) -> None:
        for pos in self._cache.values():
            views: list[LegView] = []
            mark_stale = False
            for symbol, side, qty_open, cs, entry_fill in pos.legs:
                snap = await self._bus.get_latest(f"latest:{symbol}")
                mark = _d(snap.get("mark_price"))
                if mark is None:
                    mark_stale = True
                views.append(
                    LegView(
                        signed_qty=signed_qty(side, qty_open),  # type: ignore[arg-type]
                        contract_size=cs,
                        entry_fill=entry_fill,
                        mark=mark,
                        delta=_d(snap.get("delta")),
                        gamma=_d(snap.get("gamma")),
                        theta=_d(snap.get("theta")),
                        vega=_d(snap.get("vega")),
                        iv=_d(snap.get("iv")),
                    )
                )
            unreal = unrealized_pnl(views)
            greeks = net_signed_greeks(views)
            siv = strategy_iv(views)
            total = unreal + pos.realized_pnl
            snapshot: dict[str, Decimal | None | bool] = {
                "unrealized_pnl": unreal,
                "realized_pnl": pos.realized_pnl,
                "net_delta": greeks["delta"],
                "net_gamma": greeks["gamma"],
                "net_theta": greeks["theta"],
                "net_vega": greeks["vega"],
                "strategy_iv": siv,
                "mark_stale": mark_stale,
            }
            await self._publish(pos.position_id, now, total, snapshot)
            self._accumulate(pos.position_id, now, total, snapshot)

    async def _publish(
        self,
        position_id: int,
        now: datetime,
        total: Decimal,
        snap: dict[str, Decimal | None | bool],
    ) -> None:
        mapping = {
            "ts": now.isoformat(),
            "total_pnl": str(total),
            "unrealized_pnl": str(snap["unrealized_pnl"]),
            "realized_pnl": str(snap["realized_pnl"]),
            "net_delta": str(snap["net_delta"]),
            "net_gamma": str(snap["net_gamma"]),
            "net_theta": str(snap["net_theta"]),
            "net_vega": str(snap["net_vega"]),
            "strategy_iv": "" if snap["strategy_iv"] is None else str(snap["strategy_iv"]),
            "mark_stale": "true" if snap["mark_stale"] else "false",
        }
        await self._bus.set_latest(f"paper:mtm:{position_id}", mapping)
        import orjson

        await self._bus.publish(
            f"paper:position:{position_id}",
            orjson.dumps({"ch": "paper_position", "id": position_id, **mapping}).decode(),
        )

    def _accumulate(
        self,
        position_id: int,
        now: datetime,
        total: Decimal,
        snap: dict[str, Decimal | None | bool],
    ) -> None:
        bucket = _minute(now)
        key = (position_id, bucket)
        acc = self._buf.get(key)
        if acc is None:
            self._buf[key] = _MtmAcc(
                position_id=position_id,
                ts=bucket,
                open=total,
                high=total,
                low=total,
                close=total,
                unrealized_pnl=snap["unrealized_pnl"],  # type: ignore[arg-type]
                realized_pnl=snap["realized_pnl"],  # type: ignore[arg-type]
                net_delta=snap["net_delta"],  # type: ignore[arg-type]
                net_gamma=snap["net_gamma"],  # type: ignore[arg-type]
                net_theta=snap["net_theta"],  # type: ignore[arg-type]
                net_vega=snap["net_vega"],  # type: ignore[arg-type]
                strategy_iv=snap["strategy_iv"],  # type: ignore[arg-type]
                mark_stale=bool(snap["mark_stale"]),
            )
        else:
            acc.update(total, snap)

    async def _flush(self, now: datetime) -> None:
        current = _minute(now)
        closed = [k for k, acc in self._buf.items() if acc.ts < current]
        if not closed:
            return
        rows = [self._buf.pop(k) for k in closed]
        records = [
            (
                r.position_id,
                r.ts,
                r.open,
                r.high,
                r.low,
                r.close,
                r.unrealized_pnl,
                r.realized_pnl,
                r.net_delta,
                r.net_gamma,
                r.net_theta,
                r.net_vega,
                r.strategy_iv,
                r.mark_stale,
            )
            for r in rows
        ]
        conn = await asyncpg.connect(self._dsn)
        try:
            async with conn.transaction():
                await conn.execute(
                    "CREATE TEMP TABLE _staging_pmtm "
                    "(LIKE paper_mtm_minute INCLUDING DEFAULTS) ON COMMIT DROP;"
                )
                await conn.copy_records_to_table(
                    "_staging_pmtm", records=records, columns=list(_MTM_COLUMNS)
                )
                await conn.execute(_UPSERT_SQL)
        finally:
            await conn.close()
        logger.info("paper mtm flushed", rows=len(records))
