# Runbook — Live Monitor (Section 2) testnet drill

> **Real-money feature.** Section 2 reads your live Delta account and the stop-loss
> places real market orders. This drill validates it on the **testnet (sandbox)**
> first — play money, zero real risk. Do NOT point it at mainnet until this drill
> passes. The platform ships **read-only**: nothing places an order unless you
> explicitly set `LIVE_TRADING_ENABLED=true` AND pass `confirm=true`.

## 0. One-time setup

1. **Get testnet keys.** Go to https://testnet.delta.exchange, sign up (separate
   from your real account), and under *Account → API Keys* create a key with
   **trading** permission. You get an `api-key` + `api-secret` (play money only).
2. **Point the backend at testnet + add keys.** In `.env` (gitignored):
   ```
   DELTA_BASE_URL=https://cdn-ind.testnet.deltaex.org   # verify current testnet host in Delta docs
   DELTA_WS_URL=wss://socket-ind.testnet.deltaex.org    # verify
   DELTA_API_KEY=<your testnet key>
   DELTA_API_SECRET=<your testnet secret>
   LIVE_TRADING_ENABLED=true     # ENABLES the stop-loss write path — testnet only
   ```
   Keys are read from the environment, never logged, never committed.
3. Restart the stack: `cd infra && docker compose up -d --build backend`.
4. Confirm auth is live: `curl http://localhost:8001/live/positions` should return
   `200` with a (possibly empty) `positions` array — **not** `503`. A `503`
   (`auth_not_configured`) means keys aren't being read.

## 1. The drill (do not skip — this is the only real validation of the write path)

1. **Open a small position.** In the Delta **testnet** web UI, manually buy/sell a
   small BTC option or future (e.g. 1 lot).
2. **Confirm it appears.** Open http://localhost:5173 → **Live Monitor** tab. Within
   ~10s the position shows in *Live Positions* (it syncs every 10s + via WS).
3. **Group it.** In *Strategy Grouper*, check the position, name it (e.g. "drill"),
   click **Create strategy**. It appears in the strategies list with aggregated MTM.
4. **Arm an SL that should fire immediately.** Open the strategy → **Set stop-loss**.
   Choose an **absolute** threshold *below* the current loss so it triggers at once
   (e.g. if MTM is ‑1.0, set threshold_abs = 0.5). Tick **"I understand this will
   place real market orders"**, click **Confirm**. Badge → `ARMED`.
5. **Confirm it fires.** Within a few seconds the badge goes `ARMED → TRIGGERED →
   CLOSING → CLOSED`, market close orders are placed, and the position goes to zero
   in both our UI and the Delta testnet UI. Check the backend logs for the
   `about to place close orders` INFO line (payloads, no keys) followed by
   `close orders complete all_closed=true`.
6. **Disarm/rearm — no spurious fire.** Re-open a small position, group it, arm an SL
   with a threshold that should **not** trigger (e.g. threshold_abs far larger than
   any plausible loss). Let it sit **5 minutes**. Confirm the badge stays `ARMED` and
   **no** orders are placed. Then **Disarm** (badge clears) and confirm no orders fire.

## 2. What to watch / record
- **SL state durability**: kill the backend (`docker compose stop backend`) while an
  SL is `ARMED`, restart it — the SL must resume `ARMED` (state lives in Redis
  `live:sl:{id}`). If it was mid-`CLOSING`, it re-runs the close (orders are
  `reduce_only`, so a re-run can't over-close).
- **Rate-limit headroom**: the shared auth token bucket caps at ~10 req/s
  (`AUTH_RATE_LIMIT_PER_SEC`). With one strategy you'll be far under; note the
  observed request rate during the close burst.
- **Edge cases to note**: partial fills (residual size is re-read and the single
  retry targets it), a leg expiring during the hold (frozen + flagged), and a
  leg-close that fails twice (strategy → `FAILED`, recording which legs closed —
  never a silent half-close).

## 3. Turning it off
Set `LIVE_TRADING_ENABLED=false` (or remove the keys) and restart. Section 2 reverts
to read-only; arming an SL returns `403 live_trading_disabled`. This is the safe
default the repo ships with.
