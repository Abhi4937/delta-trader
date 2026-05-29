"""Health endpoints: ``/health`` (process liveness) and ``/health/deep`` (db +
redis + Delta WS connectivity + data freshness)."""

from __future__ import annotations

from datetime import UTC, datetime

from fastapi import APIRouter
from fastapi.responses import JSONResponse
from sqlalchemy import text

from app.db.session import get_sessionmaker
from app.services.bootstrap import ensure_schema_ready
from app.services.redis_bus import get_bus
from app.services.runtime import get_runtime

router = APIRouter(tags=["health"])

_TICK_MAX_AGE_S = 60
_BAR_MAX_AGE_S = 120  # bars are per-minute (flushed ~5s into the next minute)


@router.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


async def _last_tick_age() -> float | None:
    snap = await get_bus().get_latest("latest:spot:BTC")
    ts = snap.get("ts")
    if not ts:
        return None
    try:
        return (datetime.now(tz=UTC) - datetime.fromisoformat(ts)).total_seconds()
    except ValueError:
        return None


async def _last_bar_age() -> float | None:
    try:
        sessionmaker = get_sessionmaker()
        async with sessionmaker() as session:
            row = (
                await session.execute(text("SELECT max(ts) FROM ticks_minute"))
            ).scalar_one_or_none()
        if row is None:
            return None
        return float((datetime.now(tz=UTC) - row).total_seconds())
    except Exception:
        return None


@router.get("/health/deep")
async def health_deep() -> JSONResponse:
    db_ok = await ensure_schema_ready()
    try:
        redis_ok = await get_bus().ping()
    except Exception:
        redis_ok = False
    ws_ok = get_runtime().ws_connected

    tick_age = await _last_tick_age()
    bar_age = await _last_bar_age()
    tick_fresh = tick_age is not None and tick_age < _TICK_MAX_AGE_S
    bar_fresh = bar_age is not None and bar_age < _BAR_MAX_AGE_S

    checks = {
        "db": db_ok,
        "redis": redis_ok,
        "delta_ws": ws_ok,
        "tick_fresh": tick_fresh,
        "bar_fresh": bar_fresh,
    }
    healthy = all(checks.values())
    return JSONResponse(
        status_code=200 if healthy else 503,
        content={
            "status": "ok" if healthy else "degraded",
            "checks": checks,
            "tick_age_s": tick_age,
            "bar_age_s": bar_age,
        },
    )
