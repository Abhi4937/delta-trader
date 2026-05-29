"""Bearer-token gate (ADR 0006): permissive when unset, enforced when set, with
/health + /metrics exempt."""

from __future__ import annotations

import httpx
import pytest
from fastapi import FastAPI

from app.api.auth_token import BearerTokenMiddleware
from app.core.config import settings


def _app() -> FastAPI:
    app = FastAPI()
    app.add_middleware(BearerTokenMiddleware)

    @app.get("/paper/positions")
    async def positions() -> dict[str, str]:
        return {"ok": "yes"}

    @app.get("/health")
    async def health() -> dict[str, str]:
        return {"status": "ok"}

    @app.get("/metrics")
    async def metrics() -> dict[str, str]:
        return {"m": "1"}

    return app


async def _get(app: FastAPI, path: str, token: str | None = None) -> httpx.Response:
    headers = {"Authorization": f"Bearer {token}"} if token else {}
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://t") as client:
        return await client.get(path, headers=headers)


async def test_permissive_when_token_unset(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "api_bearer_token", "")
    resp = await _get(_app(), "/paper/positions")
    assert resp.status_code == 200


async def test_rejects_without_token_when_set(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "api_bearer_token", "s3cret")
    resp = await _get(_app(), "/paper/positions")
    assert resp.status_code == 401


async def test_accepts_correct_token(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "api_bearer_token", "s3cret")
    resp = await _get(_app(), "/paper/positions", token="s3cret")
    assert resp.status_code == 200


async def test_wrong_token_rejected(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "api_bearer_token", "s3cret")
    resp = await _get(_app(), "/paper/positions", token="nope")
    assert resp.status_code == 401


async def test_health_and_metrics_exempt(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "api_bearer_token", "s3cret")
    app = _app()
    assert (await _get(app, "/health")).status_code == 200
    assert (await _get(app, "/metrics")).status_code == 200
