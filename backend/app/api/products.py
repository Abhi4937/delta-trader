"""Read-only market metadata + option-chain endpoints."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Query
from sqlalchemy import select

from app.core.logging import logger
from app.db.session import get_sessionmaker
from app.models.expiry import Expiry
from app.models.product import Product
from app.services.delta_rest import DeltaRestClient
from app.services.redis_bus import get_bus
from app.workers.tick_normalizer import _dec, _extract_iv

router = APIRouter(tags=["market"])


@router.get("/products")
async def list_products(underlying: str = Query("BTC")) -> dict[str, Any]:
    sessionmaker = get_sessionmaker()
    async with sessionmaker() as session:
        result = await session.execute(
            select(Product).where(Product.underlying == underlying.upper())
        )
        products = result.scalars().all()
    return {
        "underlying": underlying.upper(),
        "count": len(products),
        "products": [
            {
                "product_id": p.product_id,
                "symbol": p.symbol,
                "contract_type": p.contract_type,
                "strike": p.strike,
                "expiry_code": p.expiry_code,
            }
            for p in products
        ],
    }


@router.get("/expiries")
async def list_expiries(underlying: str = Query("BTC")) -> dict[str, Any]:
    sessionmaker = get_sessionmaker()
    async with sessionmaker() as session:
        result = await session.execute(
            select(Expiry).where(Expiry.underlying == underlying.upper()).order_by(Expiry.expiry_ts)
        )
        expiries = result.scalars().all()
    return {
        "underlying": underlying.upper(),
        "expiries": [{"expiry_code": e.expiry_code, "expiry_ts": e.expiry_ts} for e in expiries],
    }


def _row_from_redis(symbol: str, snap: dict[str, str]) -> dict[str, Any]:
    return {
        "symbol": symbol,
        "mark_price": _dec(snap.get("mark_price")),
        "iv": _dec(snap.get("iv")),
        "delta": _dec(snap.get("delta")),
        "gamma": _dec(snap.get("gamma")),
        "theta": _dec(snap.get("theta")),
        "vega": _dec(snap.get("vega")),
        "oi": _dec(snap.get("oi")),
        "best_bid": _dec(snap.get("best_bid")),
        "best_ask": _dec(snap.get("best_ask")),
    }


def _row_from_delta(t: dict[str, Any]) -> dict[str, Any]:
    greeks = t.get("greeks") or {}
    quotes = t.get("quotes") or {}
    return {
        "symbol": t.get("symbol"),
        "mark_price": _dec(t.get("mark_price")),
        "iv": _extract_iv(t, quotes),
        "delta": _dec(greeks.get("delta")),
        "gamma": _dec(greeks.get("gamma")),
        "theta": _dec(greeks.get("theta")),
        "vega": _dec(greeks.get("vega")),
        "oi": _dec(t.get("oi")),
        "best_bid": _dec(quotes.get("best_bid")),
        "best_ask": _dec(quotes.get("best_ask")),
    }


@router.get("/option-chain")
async def option_chain(
    underlying: str = Query("BTC"),
    expiry: str = Query(..., description="DD-MM-YYYY"),
) -> dict[str, Any]:
    """Live option chain. Prefers Redis snapshots; falls back to Delta REST."""
    underlying = underlying.upper()
    bus = get_bus()
    symbols = sorted(await bus.smembers(f"idx:chain:{underlying}:{expiry}"))

    rows: list[dict[str, Any]] = []
    for symbol in symbols:
        snap = await bus.get_latest(f"latest:{symbol}")
        if snap:
            rows.append(_row_from_redis(symbol, snap))

    source = "redis"
    if not rows:
        # Cold cache (just booted) — serve a live REST snapshot.
        source = "delta_rest"
        rest = DeltaRestClient()
        try:
            tickers: list[dict[str, Any]] = await rest.get_option_chain(underlying, expiry)
            rows = [_row_from_delta(t) for t in tickers]
        except Exception as exc:
            logger.warning("option-chain rest fallback failed", error=str(exc))
            rows = []
        finally:
            await rest.aclose()

    rows.sort(key=lambda r: (str(r["symbol"])[0], str(r["symbol"])))
    return {"underlying": underlying, "expiry": expiry, "source": source, "rows": rows}
