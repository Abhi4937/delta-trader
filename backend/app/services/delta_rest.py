"""Delta Exchange India REST client.

Public endpoints (no auth) cover Phase 1: products, option chain (tickers), L2
orderbook, historical candles. Authenticated endpoints are implemented with HMAC
signing but **gated behind ``settings.live_trading_enabled``** (CLAUDE.md rule #2)
and are not exercised in Phase 1.

Signing scheme: HMAC-SHA256(secret, method + timestamp + path + query + body),
headers ``api-key``, ``timestamp`` (unix seconds, string), ``signature``.
"""

from __future__ import annotations

import hashlib
import hmac
import time
from typing import Any

import httpx
import orjson
from tenacity import (
    retry,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential,
)

from app.core.config import settings
from app.core.logging import logger
from app.services.live.auth_gate import get_auth_bucket


class DeltaAuthError(RuntimeError):
    """Raised when an authenticated call is attempted without live trading enabled."""


def _sign(secret: str, method: str, timestamp: str, path: str, query: str, body: str) -> str:
    message = method + timestamp + path + query + body
    return hmac.new(secret.encode(), message.encode(), hashlib.sha256).hexdigest()


_RETRYABLE = (httpx.TransportError, httpx.HTTPStatusError)


class DeltaRestClient:
    """Async REST client. Use as an async context manager or share one instance."""

    def __init__(
        self,
        base_url: str | None = None,
        api_key: str | None = None,
        api_secret: str | None = None,
        timeout: float = 10.0,
    ) -> None:
        self.base_url = (base_url or settings.delta_base_url).rstrip("/")
        self._api_key = api_key if api_key is not None else settings.delta_api_key
        self._api_secret = api_secret if api_secret is not None else settings.delta_api_secret
        self._client = httpx.AsyncClient(base_url=self.base_url, timeout=timeout)

    async def __aenter__(self) -> DeltaRestClient:
        return self

    async def __aexit__(self, *exc: object) -> None:
        await self.aclose()

    async def aclose(self) -> None:
        await self._client.aclose()

    # --- core request ----------------------------------------------------
    @retry(
        retry=retry_if_exception_type(_RETRYABLE),
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=0.5, max=8),
        reraise=True,
    )
    async def _request(
        self,
        method: str,
        path: str,
        *,
        params: dict[str, Any] | None = None,
        body: dict[str, Any] | None = None,
        auth: bool = False,
        order_placing: bool = False,
    ) -> Any:
        headers: dict[str, str] = {"Accept": "application/json"}
        # Build a deterministic, alphabetically-sorted query string for signing AND
        # send that exact same ordered sequence to httpx so signed == sent.
        sorted_items: list[tuple[str, str]] = (
            sorted((k, str(v)) for k, v in params.items()) if params else []
        )
        query = "?" + "&".join(f"{k}={v}" for k, v in sorted_items) if sorted_items else ""
        body_str = orjson.dumps(body).decode() if body is not None else ""

        if auth:
            # Reads need only keys; order-placing additionally needs live trading on.
            if not self._api_key or not self._api_secret:
                raise DeltaAuthError("Authenticated Delta call requires api key + secret")
            if order_placing and not settings.live_trading_enabled:
                raise DeltaAuthError("Order placement blocked: live_trading_enabled is false")
            # Shared auth token bucket protects the account-wide rate limit.
            await get_auth_bucket().acquire(block=not order_placing)
            ts = str(int(time.time()))
            signature = _sign(self._api_secret, method.upper(), ts, path, query, body_str)
            headers.update({"api-key": self._api_key, "timestamp": ts, "signature": signature})
            # Log intent WITHOUT keys or signature.
            logger.info("delta auth request", method=method, path=path, order_placing=order_placing)

        if body is not None:
            headers["Content-Type"] = "application/json"

        # dict preserves insertion order (== sorted), so the sent query matches
        # the signed query string byte-for-byte.
        ordered_params = dict(sorted_items)
        resp = await self._client.request(
            method,
            path,
            params=ordered_params,
            headers=headers,
            content=body_str if body is not None else None,
        )
        if resp.status_code >= 500:
            resp.raise_for_status()  # retryable
        resp.raise_for_status()
        payload = resp.json()
        if isinstance(payload, dict) and "result" in payload:
            return payload["result"]
        return payload

    # --- public endpoints ------------------------------------------------
    async def get_products(self, contract_types: str = "call_options,put_options") -> Any:
        return await self._request("GET", "/v2/products", params={"contract_types": contract_types})

    async def get_option_chain(self, underlying: str, expiry: str) -> Any:
        """Option chain w/ greeks. ``expiry`` is ``DD-MM-YYYY``."""
        return await self._request(
            "GET",
            "/v2/tickers",
            params={
                "contract_types": "call_options,put_options",
                "underlying_asset_symbols": underlying,
                "expiry_date": expiry,
            },
        )

    async def get_ticker(self, symbol: str) -> Any:
        return await self._request("GET", f"/v2/tickers/{symbol}")

    async def get_l2_orderbook(self, symbol: str) -> Any:
        return await self._request("GET", f"/v2/l2orderbook/{symbol}")

    async def get_candles(self, symbol: str, resolution: str, start: int, end: int) -> Any:
        return await self._request(
            "GET",
            "/v2/history/candles",
            params={"symbol": symbol, "resolution": resolution, "start": start, "end": end},
        )

    # --- authenticated reads (keys only) ---------------------------------
    async def get_positions(self) -> Any:
        return await self._request("GET", "/v2/positions/margined", auth=True)

    async def get_open_orders(self) -> Any:
        return await self._request("GET", "/v2/orders", params={"state": "open"}, auth=True)

    # --- authenticated writes (keys + live_trading_enabled) --------------
    async def place_order(self, payload: dict[str, Any]) -> Any:
        """Place an order. ``order_placing=True`` enforces the live-trading guard
        and uses non-blocking rate limiting (burst-sensitive)."""
        return await self._request(
            "POST", "/v2/orders", body=payload, auth=True, order_placing=True
        )

    async def cancel_order(self, order_id: int, product_id: int) -> Any:
        return await self._request(
            "DELETE",
            "/v2/orders",
            body={"id": order_id, "product_id": product_id},
            auth=True,
            order_placing=True,
        )
