"""Optional bearer-token gate on the platform API (ADR 0006 §security).

Enforced only when ``settings.api_bearer_token`` is set (prod). Unset -> permissive
(dev/CI/tests + existing UX unchanged). Infra endpoints (/health*, /metrics) are
always exempt so liveness probes and Prometheus scraping work without the token.
WS clients pass the token via ``?token=`` (browsers can't set WS headers).
"""

from __future__ import annotations

import hmac
from collections.abc import Awaitable, Callable

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse, Response

from app.core.config import settings

_EXEMPT_PREFIXES = ("/health", "/metrics", "/docs", "/openapi.json", "/redoc")


class BearerTokenMiddleware(BaseHTTPMiddleware):
    async def dispatch(
        self, request: Request, call_next: Callable[[Request], Awaitable[Response]]
    ) -> Response:
        token = settings.api_bearer_token
        if not token:  # disabled in dev / CI
            return await call_next(request)
        path = request.url.path
        if path == "/" or any(path.startswith(p) for p in _EXEMPT_PREFIXES):
            return await call_next(request)

        if path.startswith("/ws"):
            supplied = request.query_params.get("token", "")
        else:
            header = request.headers.get("authorization", "")
            supplied = header[7:] if header.lower().startswith("bearer ") else ""

        if not hmac.compare_digest(supplied, token):  # constant-time
            return JSONResponse(status_code=401, content={"error": "unauthorized"})
        return await call_next(request)
