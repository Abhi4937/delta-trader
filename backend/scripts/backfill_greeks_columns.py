"""Backfill `rv_intraday` / `rv_historical` on existing *_mtm_minute rows (ADR 0005).

Greeks (`net_*`) and `strategy_iv` are written live by the minute workers from
Phase 2/3, so only the realized-vol columns need backfilling for rows that predate
the Phase 4 migration. For each minute row this computes the underlying RV from the
`ticks_minute` bars up to that row's timestamp.

Idempotent — re-running overwrites the same values. Usage:

    cd backend && POSTGRES_HOST=localhost uv run --no-sync python -m scripts.backfill_greeks_columns
    # or inside the container:  python -m scripts.backfill_greeks_columns
"""

from __future__ import annotations

import asyncio
from decimal import Decimal

import asyncpg

from app.core.config import settings
from app.services.quant.rv import historical_rv, intraday_rv

UNDERLYING_FUTURE = "BTCUSD"


async def _rv_at(conn: asyncpg.Connection, ts: object) -> tuple[Decimal | None, Decimal | None]:
    intra_rows = await conn.fetch(
        "SELECT close FROM ticks_minute WHERE symbol=$1 AND ts <= $2 "
        "AND ts > $2 - ($3 || ' minutes')::interval ORDER BY ts",
        UNDERLYING_FUTURE,
        ts,
        str(settings.rv_intraday_window_minutes),
    )
    hist_rows = await conn.fetch(
        "SELECT time_bucket('1 day', ts) AS d, last(close, ts) AS c FROM ticks_minute "
        "WHERE symbol=$1 AND ts <= $2 AND ts > $2 - ($3 || ' days')::interval GROUP BY d ORDER BY d",
        UNDERLYING_FUTURE,
        ts,
        str(settings.rv_historical_window_days),
    )
    intra = intraday_rv([Decimal(str(r["close"])) for r in intra_rows if r["close"] is not None])
    hist = historical_rv([Decimal(str(r["c"])) for r in hist_rows if r["c"] is not None])
    return intra, hist


async def backfill(table: str, id_col: str) -> int:
    # Whitelist (mirrors app.api.timeseries) — never interpolate unvalidated names.
    if table not in {"paper_mtm_minute", "live_mtm_minute"} or id_col not in {
        "position_id",
        "strategy_id",
    }:
        raise ValueError(f"invalid table/id_col: {table}/{id_col}")
    conn = await asyncpg.connect(settings.pg_dsn_sync)
    updated = 0
    try:
        rows = await conn.fetch(
            f"SELECT {id_col}, ts FROM {table} "
            "WHERE rv_intraday IS NULL OR rv_historical IS NULL ORDER BY ts"
        )
        for r in rows:
            intra, hist = await _rv_at(conn, r["ts"])
            await conn.execute(
                f"UPDATE {table} SET rv_intraday=$1, rv_historical=$2 "
                f"WHERE {id_col}=$3 AND ts=$4",
                intra,
                hist,
                r[id_col],
                r["ts"],
            )
            updated += 1
    finally:
        await conn.close()
    return updated


async def main() -> None:
    for table, id_col in (("paper_mtm_minute", "position_id"), ("live_mtm_minute", "strategy_id")):
        n = await backfill(table, id_col)
        print(f"backfilled {n} rows in {table}")


if __name__ == "__main__":
    asyncio.run(main())
