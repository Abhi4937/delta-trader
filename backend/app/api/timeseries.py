"""Shared per-minute timeseries reader for the paper/live MTM hypertables (ADR 0005).

Field names are user-facing aliases mapped to the actual columns; only whitelisted
column names ever reach the SQL string (injection-safe), range bounds are bound
params.
"""

from __future__ import annotations

from typing import Any

from sqlalchemy import text

from app.db.session import get_sessionmaker

# user alias -> physical column (both *_mtm_minute tables share these names)
FIELD_MAP: dict[str, str] = {
    "close": "close",
    "total_pnl": "close",
    "unrealized_pnl": "unrealized_pnl",
    "realized_pnl": "realized_pnl",
    "delta": "net_delta",
    "gamma": "net_gamma",
    "theta": "net_theta",
    "vega": "net_vega",
    "iv": "strategy_iv",
    "rv_intraday": "rv_intraday",
    "rv_historical": "rv_historical",
}

_ALLOWED_TABLES = {"paper_mtm_minute", "live_mtm_minute"}


async def read_timeseries(
    table: str,
    id_column: str,
    id_value: int,
    fields: str,
    *,
    from_: str | None = None,
    to: str | None = None,
) -> dict[str, Any]:
    if table not in _ALLOWED_TABLES or id_column not in {"position_id", "strategy_id"}:
        raise ValueError("invalid table/id column")
    requested = [f.strip() for f in fields.split(",") if f.strip()]
    selected = [(f, FIELD_MAP[f]) for f in requested if f in FIELD_MAP]
    if not selected:
        selected = [("close", "close")]
    # column names are from the whitelist above -> safe to interpolate
    col_sql = ", ".join(col for _alias, col in selected)
    sql = f"SELECT ts, {col_sql} FROM {table} WHERE {id_column} = :id"
    params: dict[str, Any] = {"id": id_value}
    if from_:
        sql += " AND ts >= :from_"
        params["from_"] = from_
    if to:
        sql += " AND ts <= :to"
        params["to"] = to
    sql += " ORDER BY ts"

    sessionmaker = get_sessionmaker()
    async with sessionmaker() as session:
        rows = (await session.execute(text(sql), params)).all()
    points = [
        {"ts": r[0], **{alias: r[i + 1] for i, (alias, _col) in enumerate(selected)}} for r in rows
    ]
    return {"fields": [a for a, _ in selected], "points": points}
