# Delta Exchange Integration

Authoritative notes on Delta Exchange India API behavior, verified against the live
public endpoints during Phase 1. See also `.claude/skills/delta-api`.

## Endpoints (verified)
- REST base: `https://api.india.delta.exchange`
- WS: `wss://socket.india.delta.exchange` (connects with or without a `/v2` suffix)

## Verified quirks (Phase 1)

### `mark_vol` scaling differs by transport
- **REST `/v2/tickers`** returns `mark_vol` already as a **sigma fraction**
  (e.g. `"0.2495"` = ~25% IV). It is **NOT** ×100 here. `quotes.mark_iv` agrees.
- The `delta-api` skill documents the WS `v2/ticker` channel as sending IV×100.
- We normalize defensively in `app/workers/tick_normalizer._normalize_iv`: values
  `> 5` are treated as percent-scaled and divided by 100; values `<= 5` are taken
  as fractions. Crypto option IV realistically lives in `[0.05, 5.0]`, so the
  threshold cleanly separates the two encodings. Deep ITM/OTM strikes can report
  large/unstable IV — expected, not a bug.

### Product id field
- The integer product id is the `id` field on `/v2/products` objects (e.g. `136153`).
  `product_id` is `null` in that listing. Cancel/modify endpoints need the integer `id`.

### Product / ticker shapes
- Products: `underlying_asset.symbol` carries `"BTC"`; `contract_type` is
  `call_options` / `put_options`; `strike_price` and `settlement_time` are present.
- Tickers: greeks under `greeks` (`delta/gamma/theta/vega/rho`, all **strings**),
  top-of-book under `quotes` (`best_bid`/`best_ask`/`mark_iv`), `oi`, `volume`,
  `timestamp` in **microseconds** since epoch.

### Symbol format
- `{C|P}-{UNDERLYING}-{STRIKE}-{DDMMYY}` — e.g. `C-BTC-90000-310125`. We parse the
  6-digit tail to the `DD-MM-YYYY` expiry code used by the chain endpoint.
- Spot index: `.DEXBTUSD`. Perpetual/futures: `BTCUSD`.

## Phase 1 scope
- Public endpoints only. No authenticated calls (gated behind `live_trading_enabled`).
- BTC only; nearest expiry is subscribed on the WS to bound bandwidth.
