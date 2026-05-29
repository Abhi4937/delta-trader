# 0005 — Indicators, IV/RV polish, Greeks charts

- **Status**: Accepted
- **Date**: 2026-05-28
- **Deciders**: Project owner, staff engineer / quant

## Context
Phase 4 adds technical indicators to the BTC spot chart (and any option's premium
chart), plus per-position Greeks-vs-time, IV-vs-time, an RV panel with selectable
windows, and a simplified vol cone. The price/greek/IV data already exists in
`ticks_minute`, `paper_mtm_minute`, and `live_mtm_minute` (which Phase 2/3 already
populate with `net_delta/net_gamma/net_theta/net_vega/strategy_iv`).

## Decision

### 1. Indicators are computed on the FRONTEND
Indicators (ADX, RSI, MACD, EMA, Bollinger, ATR) are **pure functions of the price
series** computed in the browser from the minute-bar series (REST history + WS
tail). Rationale: zero new backend CPU, instant toggling, no caching/invalidation,
and the same code runs on the spot series or any option's premium series.
**Rejected**: backend computation (adds load + a cache layer for data that is cheap
to derive client-side and changes as the user toggles params).

Implementation: small, dependency-light **inline TS** in `frontend/src/lib/indicators/`
(one pure function per indicator, `(bars, params) => (number|null)[]`), `null` for
the warm-up region at series start (no NaN leakage into charts). Chosen over the
`technicalindicators` npm package for tree-shakeability and explicit edge/NaN control;
each is unit-tested against a reference series.

**Incremental recompute**: on each new minute bar the chart appends one bar and
recomputes only the tail the new bar affects (EMA/RSI/etc. are recurrence relations),
never the whole series.

### 2. Backend serves history; persists RV per-minute
- **New columns** `rv_intraday NUMERIC(10,6)`, `rv_historical NUMERIC(10,6)` on
  `paper_mtm_minute` and `live_mtm_minute`. (Greeks + `strategy_iv` already exist —
  no rename.) The minute workers compute the underlying RV (from recent `ticks_minute`
  bars) and write it alongside the OHLC/greeks each flush.
- **`GET /paper/positions/{id}/timeseries`** and **`GET /live/strategies/{id}/timeseries`**
  — params `fields` (comma list of `close,delta,gamma,theta,vega,iv,rv_intraday,rv_historical`),
  `from`, `to`. Field aliases map to columns (`delta→net_delta`, `iv→strategy_iv`).
  Returns a tidy `{ts, <field>...}` frame, Decimal-as-strings.
- **`GET /spot/candles?symbol=&resolution=&from=&to=`** — proxies Delta
  `/v2/history/candles`, cached in Redis (5-min TTL for closed-bar ranges; the
  in-progress current bar is not cached). Feeds the spot/premium charts' history.
- **Backfill**: `scripts/backfill_greeks_columns.py` fills `rv_*` for existing rows
  from `ticks_minute`. Idempotent; documented in its module docstring.

### 3. Frontend chart surfaces
`IndicatorPanel` (toggle + params) drives an upgraded `SpotChart` (Lightweight Charts
panes: candles + EMA/BBands overlays; ADX/RSI/MACD subpanes; ADX(14) on by default),
reused as `OptionPremiumChart`. `PositionGreeksChart` (4 lines), `PositionIVChart`
(agg + per-leg), `RVPanel` (1h/4h/1d/30d cards + IV-vs-RV chart), `VolConeMini` (ATM
IV per expiry + current RV overlay). Wired into `PaperPositionDetail` /
`LiveStrategyDetail` as tabs: Overview | PnL | Greeks | IV/RV | Spot.

## Consequences
- No new hot-path backend load; indicators are instant and param-tunable client-side.
- The two `*_mtm_minute` tables become the single tidy source for per-position
  Greeks/IV/RV time series; the `timeseries` endpoint is a thin typed read.
- RV is now persisted (not just computed on demand), so historical RV-vs-IV is exact.

## Test strategy
- TS indicator unit tests vs a hand/`pandas`-verified reference series, covering the
  warm-up (`null`) region — ADX/RSI/MACD/Bollinger especially.
- Backend: timeseries field-mapping + range filtering; candles cache hit/miss; the
  RV column write in the worker flush.
- E2E: toggle RSI/EMA on the spot chart; Greeks + IV/RV tabs render on a live position.

## Implementation guidance
1. Migration: add `rv_intraday`, `rv_historical` to both `*_mtm_minute` tables.
2. `quant/rv.py` already has the math; workers call it per flush and add the columns.
3. `api/paper.py` + `api/live.py`: `timeseries` endpoints; new `api/spot.py` candles proxy.
4. `scripts/backfill_greeks_columns.py`.
5. `frontend/src/lib/indicators/*` + charts + tab wiring.
