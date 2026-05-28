---
name: delta-api
description: Use this skill whenever code touches Delta Exchange API — REST endpoints, WebSocket channels, signing, product symbols, error codes. Covers India endpoints specifically (api.india.delta.exchange, socket.india.delta.exchange).
---

# Delta Exchange India — API reference

## Endpoints
- REST base: `https://api.india.delta.exchange`
- WS:        `wss://socket.india.delta.exchange/v2`

## Auth signing (REST)
HMAC-SHA256(secret, `method + timestamp + path + query + body`). Headers: `api-key`, `timestamp` (unix sec, string), `signature`. Query string must be sorted alphabetically when signing.

## Key REST endpoints
| Purpose | Method | Path | Notes |
|---|---|---|---|
| Products list | GET | `/v2/products` | Filter `contract_types=call_options,put_options` |
| Option chain (with greeks) | GET | `/v2/tickers` | params: `contract_types`, `underlying_asset_symbols=BTC`, `expiry_date=DD-MM-YYYY` |
| Single ticker | GET | `/v2/tickers/{symbol}` | Symbol format: `C-BTC-90000-310125` |
| L2 orderbook | GET | `/v2/l2orderbook/{symbol}` | Use for slippage modeling |
| Historical candles | GET | `/v2/history/candles` | `resolution=1m/5m/1h/1d`, unix-second `start`/`end` |
| Positions (auth) | GET | `/v2/positions/margined` | Returns live positions with margin |
| Open orders (auth) | GET | `/v2/orders?state=open` | |
| Place order (auth) | POST | `/v2/orders` | See payload below |
| Cancel order (auth) | DELETE | `/v2/orders` | body: `{id, product_id}` |
| Bracket order | POST | `/v2/orders/bracket` | For SL + take-profit attached |

## Symbol format
`{C|P}-{UNDERLYING}-{STRIKE}-{DDMMYY}` — e.g. `C-BTC-90000-310125` is BTC 90000 strike call expiring 31-Jan-2025. Futures: `BTCUSD`. Spot index: `.DEXBTUSD`.

## WebSocket subscribe payload
```json
{"type":"subscribe","payload":{"channels":[{"name":"v2/ticker","symbols":["C-BTC-90000-310125"]}]}}
```

## Channels to know
- `v2/ticker` — full ticker w/ greeks, mark_price, mark_vol (IV*100), OI. Use for option chain.
- `l2_orderbook` — depth, top of book. Use for slippage and live bid/ask spread.
- `mark_price` — per-symbol mark only (lighter).
- `spot_price` — for `.DEXBTUSD` etc.
- `candlestick_1m` — 1-min OHLC; use for ADX and charts.
- `all_trades` — public trade tape.
- `orders`, `positions`, `fills` (authenticated) — for Section 2 live monitoring.

## Gotchas
- `mark_vol` is **IV × 100** (e.g. `"55"` means 55% IV). Divide by 100 before using as σ.
- Greeks come back as **strings**, parse to Decimal.
- `product_id` is an integer, distinct from `symbol`. Cancel/modify endpoints need the integer.
- India endpoints (`api.india.delta.exchange`) ≠ global (`api.delta.exchange`). Do not mix.
- WS sends heartbeats; ignore `{"type":"heartbeat"}`.
- After reconnect, you must re-subscribe. The server does NOT remember your subs.
- Rate limit: ~10 req/sec on REST. Use a token bucket if you make burst calls.

## Sandbox
- Testnet base: `https://cdn-ind.testnet.deltaex.org` (verify in docs before using).
- Get keys from testnet UI. Use these in all integration tests.

## Source of truth
- API docs: https://docs.delta.exchange/  (global) and the India-specific section.
- Python sample client: https://github.com/delta-exchange/python-rest-client
- Always verify behavior against the live response, not just docs.
