"""Startup bootstrap: load BTC products + expiries from Delta's public REST,
persist them, and populate Redis index sets used by the API and WS hub.

Returns the symbols the WS ingestor should subscribe to (nearest expiry only, to
bound bandwidth — Phase 1 default per the defaults table).
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import text
from sqlalchemy.dialects.postgresql import insert as pg_insert

from app.core.logging import logger
from app.db.session import get_sessionmaker
from app.models.expiry import Expiry
from app.models.market import Tick  # noqa: F401  (ensures models import is exercised)
from app.models.product import Product
from app.services.delta_rest import DeltaRestClient
from app.services.redis_bus import RedisBus, get_bus

SPOT_SYMBOL = ".DEXBTUSD"
FUTURES_SYMBOL = "BTCUSD"


@dataclass
class BootstrapResult:
    underlying: str
    nearest_expiry: str | None
    option_symbols: list[str]
    spot_symbol: str
    futures_symbol: str


def parse_expiry_code(symbol: str) -> str | None:
    """``C-BTC-90000-310125`` -> ``31-01-2025``."""
    parts = symbol.split("-")
    if len(parts) < 4:
        return None
    tail = parts[-1]
    if len(tail) != 6 or not tail.isdigit():
        return None
    dd, mm, yy = tail[0:2], tail[2:4], tail[4:6]
    return f"{dd}-{mm}-20{yy}"


def _expiry_ts(expiry_code: str) -> datetime | None:
    try:
        dt = datetime.strptime(expiry_code, "%d-%m-%Y")
        return dt.replace(hour=12, tzinfo=UTC)
    except ValueError:
        return None


async def bootstrap_products(
    underlying: str = "BTC",
    rest: DeltaRestClient | None = None,
    bus: RedisBus | None = None,
) -> BootstrapResult:
    created_rest = rest is None
    rest = rest or DeltaRestClient()
    bus = bus or get_bus()

    try:
        products: list[dict[str, Any]] = await rest.get_products()
    finally:
        if created_rest:
            await rest.aclose()

    rows: list[dict[str, Any]] = []
    expiries: dict[str, datetime] = {}
    chain: dict[str, list[str]] = {}
    for p in products:
        ua = p.get("underlying_asset") or {}
        if ua.get("symbol") != underlying:
            continue
        symbol = p.get("symbol")
        pid = p.get("id")
        if not symbol or pid is None:
            continue
        expiry_code = parse_expiry_code(symbol)
        strike = p.get("strike_price")
        cv = p.get("contract_value")
        rows.append(
            {
                "product_id": int(pid),
                "symbol": symbol,
                "contract_type": p.get("contract_type", ""),
                "underlying": underlying,
                "strike": Decimal(str(strike)) if strike is not None else None,
                "expiry_code": expiry_code,
                "contract_size": Decimal(str(cv)) if cv is not None else Decimal(1),
            }
        )
        if expiry_code:
            ts = _expiry_ts(expiry_code)
            if ts is not None:
                expiries[expiry_code] = ts
                chain.setdefault(expiry_code, []).append(symbol)

    await _persist(rows, expiries)
    await _index(bus, underlying, expiries, chain)

    nearest = _nearest_expiry(expiries)
    option_symbols = sorted(chain.get(nearest, [])) if nearest else []
    logger.info(
        "bootstrap complete",
        underlying=underlying,
        products=len(rows),
        expiries=len(expiries),
        nearest=nearest,
        nearest_symbols=len(option_symbols),
    )
    return BootstrapResult(
        underlying=underlying,
        nearest_expiry=nearest,
        option_symbols=option_symbols,
        spot_symbol=SPOT_SYMBOL,
        futures_symbol=FUTURES_SYMBOL,
    )


def _nearest_expiry(expiries: dict[str, datetime]) -> str | None:
    now = datetime.now(tz=UTC)
    future = {code: ts for code, ts in expiries.items() if ts >= now}
    pool = future or expiries
    if not pool:
        return None
    return min(pool, key=lambda code: pool[code])


async def _persist(rows: list[dict[str, Any]], expiries: dict[str, datetime]) -> None:
    if not rows:
        return
    sessionmaker = get_sessionmaker()
    async with sessionmaker() as session, session.begin():
        prod_stmt = pg_insert(Product).values(rows)
        prod_stmt = prod_stmt.on_conflict_do_update(
            index_elements=[Product.product_id],
            set_={
                "symbol": prod_stmt.excluded.symbol,
                "contract_type": prod_stmt.excluded.contract_type,
                "strike": prod_stmt.excluded.strike,
                "expiry_code": prod_stmt.excluded.expiry_code,
                "contract_size": prod_stmt.excluded.contract_size,
            },
        )
        await session.execute(prod_stmt)

        exp_values = [
            {"underlying": "BTC", "expiry_code": code, "expiry_ts": ts}
            for code, ts in expiries.items()
        ]
        if exp_values:
            exp_stmt = pg_insert(Expiry).values(exp_values)
            exp_stmt = exp_stmt.on_conflict_do_update(
                index_elements=[Expiry.underlying, Expiry.expiry_code],
                set_={"expiry_ts": exp_stmt.excluded.expiry_ts},
            )
            await session.execute(exp_stmt)


async def _index(
    bus: RedisBus,
    underlying: str,
    expiries: dict[str, datetime],
    chain: dict[str, list[str]],
) -> None:
    all_symbols = [s for syms in chain.values() for s in syms]
    if all_symbols:
        await bus.sadd(f"idx:symbols:{underlying}", *all_symbols)
    if expiries:
        await bus.sadd(f"idx:expiries:{underlying}", *expiries.keys())
    for code, syms in chain.items():
        if syms:
            await bus.sadd(f"idx:chain:{underlying}:{code}", *syms)


async def ensure_schema_ready() -> bool:
    """Light DB readiness probe used by /health/deep."""
    sessionmaker = get_sessionmaker()
    try:
        async with sessionmaker() as session:
            await session.execute(text("SELECT 1"))
        return True
    except Exception as exc:
        logger.warning("db not ready", error=str(exc))
        return False
