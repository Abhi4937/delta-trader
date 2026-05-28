"""Health endpoints: ``/health`` (process liveness) and ``/health/deep`` (db +
redis + Delta WS connectivity)."""

from __future__ import annotations

from fastapi import APIRouter
from fastapi.responses import JSONResponse

from app.services.bootstrap import ensure_schema_ready
from app.services.redis_bus import get_bus
from app.services.runtime import get_runtime

router = APIRouter(tags=["health"])


@router.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@router.get("/health/deep")
async def health_deep() -> JSONResponse:
    db_ok = await ensure_schema_ready()
    try:
        redis_ok = await get_bus().ping()
    except Exception:
        redis_ok = False
    ws_ok = get_runtime().ws_connected

    checks = {"db": db_ok, "redis": redis_ok, "delta_ws": ws_ok}
    healthy = all(checks.values())
    return JSONResponse(
        status_code=200 if healthy else 503,
        content={"status": "ok" if healthy else "degraded", "checks": checks},
    )
