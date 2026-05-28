"""Delta REST client tests with respx-mocked HTTP (recorded-shape fixtures)."""

from __future__ import annotations

import httpx
import pytest
import respx

from app.services.delta_rest import DeltaAuthError, DeltaRestClient, _sign

BASE = "https://api.india.delta.exchange"

PRODUCTS_FIXTURE = {
    "result": [
        {
            "id": 136153,
            "symbol": "C-BTC-74600-310526",
            "contract_type": "call_options",
            "strike_price": "74600",
            "underlying_asset": {"symbol": "BTC"},
        }
    ]
}

TICKERS_FIXTURE = {
    "result": [
        {
            "symbol": "P-BTC-75200-310526",
            "mark_price": "1952.58",
            "mark_vol": "0.2495",
            "oi": "0.45",
            "greeks": {"delta": "-0.87", "gamma": "0.0001", "theta": "-59", "vega": "12"},
            "quotes": {"best_bid": "1943", "best_ask": "1971"},
        }
    ]
}


@respx.mock
async def test_get_products_unwraps_result() -> None:
    respx.get(f"{BASE}/v2/products").mock(return_value=httpx.Response(200, json=PRODUCTS_FIXTURE))
    async with DeltaRestClient(base_url=BASE) as client:
        products = await client.get_products()
    assert products[0]["symbol"] == "C-BTC-74600-310526"
    assert products[0]["id"] == 136153


@respx.mock
async def test_get_option_chain_sends_params() -> None:
    route = respx.get(f"{BASE}/v2/tickers").mock(
        return_value=httpx.Response(200, json=TICKERS_FIXTURE)
    )
    async with DeltaRestClient(base_url=BASE) as client:
        rows = await client.get_option_chain("BTC", "31-05-2026")
    assert rows[0]["symbol"] == "P-BTC-75200-310526"
    request = route.calls.last.request
    assert "underlying_asset_symbols=BTC" in str(request.url)
    assert "expiry_date=31-05-2026" in str(request.url)


@respx.mock
async def test_retries_on_5xx_then_succeeds() -> None:
    route = respx.get(f"{BASE}/v2/products")
    route.side_effect = [
        httpx.Response(503),
        httpx.Response(200, json=PRODUCTS_FIXTURE),
    ]
    async with DeltaRestClient(base_url=BASE) as client:
        products = await client.get_products()
    assert len(products) == 1
    assert route.call_count == 2  # one retry


async def test_auth_call_blocked_without_live_trading() -> None:
    async with DeltaRestClient(base_url=BASE, api_key="k", api_secret="s") as client:
        with pytest.raises(DeltaAuthError):
            await client.get_positions()


def test_signature_is_deterministic_hmac() -> None:
    sig1 = _sign("secret", "GET", "1700000000", "/v2/orders", "?state=open", "")
    sig2 = _sign("secret", "GET", "1700000000", "/v2/orders", "?state=open", "")
    assert sig1 == sig2
    assert len(sig1) == 64  # sha256 hexdigest
