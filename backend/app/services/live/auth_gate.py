"""The single authentication gate for all live (real-money) Delta access (ADR 0004 §1).

Every authenticated call funnels through ``require_auth``. Reads need only keys
present; order-placing/cancel paths additionally require ``live_trading_enabled``
AND a per-request ``confirm=true``. A single shared async token bucket throttles
ALL authenticated calls so a close burst can't push the account over Delta's rate
limit. Keys are never logged.
"""

from __future__ import annotations

import asyncio
import time

from app.core.config import settings


class AuthGateError(Exception):
    """Carries the HTTP status the API should return for a failed gate check."""

    def __init__(self, status_code: int, error: str, message: str) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.error = error
        self.message = message


def keys_present() -> bool:
    return bool(settings.delta_api_key) and bool(settings.delta_api_secret)


def require_auth(*, order_placing: bool = False, confirm: bool | None = None) -> None:
    """Raise ``AuthGateError`` (carrying 503/403/422) if the call is not permitted.

    (a) keys present              -> else 503  (every authenticated call)
    (b) live_trading_enabled true -> else 403  (order-placing/cancel only)
    (c) confirm is True           -> else 422  (order-placing/cancel only)
    """
    if not keys_present():
        raise AuthGateError(503, "auth_not_configured", "Delta API keys are not configured")
    if order_placing:
        if not settings.live_trading_enabled:
            raise AuthGateError(403, "live_trading_disabled", "live_trading_enabled is false")
        if confirm is not True:
            raise AuthGateError(
                422, "confirmation_required", "confirm=true is required to place/cancel orders"
            )


class RateLimitError(AuthGateError):
    """429 — the shared auth token bucket is exhausted."""

    def __init__(self, retry_after: float) -> None:
        super().__init__(429, "rate_limited", "authenticated rate limit exhausted")
        self.retry_after = retry_after


class TokenBucket:
    """Async token bucket shared by every authenticated Delta call."""

    def __init__(self, rate_per_sec: float, burst: float | None = None) -> None:
        self.rate = rate_per_sec
        self.capacity = burst if burst is not None else rate_per_sec
        self._tokens = self.capacity
        self._updated = time.monotonic()
        self._lock = asyncio.Lock()

    async def acquire(self, *, block: bool = False) -> None:
        """Take one token. ``block=False`` raises RateLimitError when empty."""
        async with self._lock:
            self._refill()
            if self._tokens < 1:
                if not block:
                    raise RateLimitError(retry_after=max(0.0, (1 - self._tokens) / self.rate))
                wait = (1 - self._tokens) / self.rate
                await asyncio.sleep(wait)
                self._refill()
            self._tokens -= 1

    def _refill(self) -> None:
        now = time.monotonic()
        self._tokens = min(self.capacity, self._tokens + (now - self._updated) * self.rate)
        self._updated = now


_bucket: TokenBucket | None = None


def get_auth_bucket() -> TokenBucket:
    global _bucket
    if _bucket is None:
        _bucket = TokenBucket(settings.auth_rate_limit_per_sec)
    return _bucket


def reset_auth_bucket() -> None:
    global _bucket
    _bucket = None
