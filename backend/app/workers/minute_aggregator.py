"""Minute aggregator: drains closed minute buckets from the shared buffer and
upserts them into the Timescale hypertable ``ticks_minute``.

Uses asyncpg COPY into a temp table then ``INSERT ... ON CONFLICT (symbol, ts) DO
UPDATE`` for idempotency on replays/late ticks (ADR 0002 §6).
"""

from __future__ import annotations

import asyncio
from datetime import UTC, datetime

import asyncpg

from app.core import metrics
from app.core.config import settings
from app.core.logging import logger
from app.workers.minute_buffer import ROW_COLUMNS, MinuteAccumulator, MinuteBuffer

_FLUSH_INTERVAL_SECONDS = 5.0

_UPSERT_SQL = f"""
INSERT INTO ticks_minute ({", ".join(ROW_COLUMNS)})
SELECT {", ".join(ROW_COLUMNS)} FROM _staging_ticks
ON CONFLICT (symbol, ts) DO UPDATE SET
  open = EXCLUDED.open, high = EXCLUDED.high, low = EXCLUDED.low,
  close = EXCLUDED.close, mark_price = EXCLUDED.mark_price, iv = EXCLUDED.iv,
  delta = EXCLUDED.delta, gamma = EXCLUDED.gamma, theta = EXCLUDED.theta,
  vega = EXCLUDED.vega, oi = EXCLUDED.oi, volume = EXCLUDED.volume;
"""


def _asyncpg_dsn() -> str:
    # asyncpg wants a plain postgres:// DSN, not the SQLAlchemy +asyncpg form.
    return settings.pg_dsn_sync


class MinuteAggregator:
    def __init__(
        self,
        buffer: MinuteBuffer,
        dsn: str | None = None,
        flush_interval: float = _FLUSH_INTERVAL_SECONDS,
    ) -> None:
        self._buffer = buffer
        self._dsn = dsn or _asyncpg_dsn()
        self._flush_interval = flush_interval
        self._running = False

    async def run(self) -> None:
        self._running = True
        logger.info("minute aggregator started", interval=self._flush_interval)
        while self._running:
            await asyncio.sleep(self._flush_interval)
            try:
                await self.flush_once(datetime.now(tz=UTC))
            except Exception as exc:
                logger.warning("minute flush failed; will retry", error=str(exc))

    async def flush_once(self, now: datetime) -> int:
        """Drain closed buckets and upsert them. Returns rows written.

        On any DB failure the drained rows are restored to the buffer so the next
        flush retries them — a transient Postgres outage never loses minute bars.
        """
        drained = self._buffer.drain_closed(now)
        if not drained:
            return 0
        try:
            conn = await asyncpg.connect(self._dsn)
            try:
                await self._write(conn, drained)
            finally:
                await conn.close()
        except Exception:
            self._buffer.readd(drained)
            raise
        metrics.ticks_persisted.inc(len(drained))
        logger.info("minute bars persisted", rows=len(drained))
        return len(drained)

    async def _write(self, conn: asyncpg.Connection, drained: list[MinuteAccumulator]) -> None:
        async with conn.transaction():
            await conn.execute(
                "CREATE TEMP TABLE _staging_ticks "
                "(LIKE ticks_minute INCLUDING DEFAULTS) ON COMMIT DROP;"
            )
            await conn.copy_records_to_table(
                "_staging_ticks",
                records=[acc.as_row() for acc in drained],
                columns=list(ROW_COLUMNS),
            )
            await conn.execute(_UPSERT_SQL)

    def stop(self) -> None:
        self._running = False
