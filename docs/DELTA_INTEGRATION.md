# Delta Exchange Integration

Authoritative notes on Delta Exchange India API behavior, verified against the live
public endpoints during Phase 1. See also `.claude/skills/delta-api`.

## Endpoints (verified)
- REST base: `https://api.india.delta.exchange`
- WS: `wss://socket.india.delta.exchange` (connects with or without a `/v2` suffix)

## Verified quirks (Phase 1)

### IV: use `quotes.mark_iv`, not `mark_vol`
- Both the WS `v2/ticker` frame and REST `/v2/tickers` carry **`quotes.mark_iv`** —
  Delta's authoritative mark IV, **always a clean sigma fraction** (e.g.
  `"0.24001"` = ~24% IV). This is the source of truth; we read it directly in
  `app/workers/tick_normalizer._extract_iv`.
- The top-level `mark_vol` is ambiguous: REST sends a fraction (`"0.2495"`) while
  the `delta-api` skill documents the WS channel as IV×100. We only fall back to it
  (via `_scale_iv`: divide by 100 when `> 5`) if `quotes.mark_iv` is absent.
- **Why the switch:** the old `mark_vol > 5 → ÷100` heuristic mis-scaled any true
  IV `<= 5%` by 100× (it looked like a fraction and was left as-is). Reading
  `mark_iv` removes that latent bug entirely. Verified ATM and deep strikes now
  match Delta's published IV exactly.
- Deep ITM/OTM strikes can report large/clamped IV (Delta floors illiquid strikes
  to a flat value) — this is Delta's own data, not a scaling bug on our side.

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
