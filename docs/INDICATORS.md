# Indicators & vol references

Technical indicators are **pure functions of the price series, computed on the
frontend** (`frontend/src/lib/indicators/`) from minute bars (REST history +
live WS tail). Each returns an array aligned to the input length, with `null` in
the warm-up region (no NaN ever reaches a chart). Indicators run on the BTC spot
series and on any option's premium series (same component). All use `number` math
(indicators are analytics, not money — money stays `Decimal` elsewhere).

## Conventions
- `Bar = {time: unix_seconds, open, high, low, close}`.
- Smoothing: Wilder's (RSI/ATR/ADX) vs EMA (MACD) per each indicator's standard.
- Warm-up: the first defined index is documented per indicator; earlier entries
  are `null`. Output length always equals input length.
- Recompute is incremental — a new bar recomputes only the affected tail over a
  bounded window (charts cap history at the last ~360 bars).

## Formulas & parameters

| Indicator | Params (default) | First defined index | Notes |
|---|---|---|---|
| **EMA** | period (20/50/200) | `period-1` | `EMA_t = α·close_t + (1-α)·EMA_{t-1}`, `α = 2/(period+1)`; seed = SMA(period). |
| **RSI** | period (14) | `period` | Wilder. `RS = avgGain/avgLoss`, `RSI = 100 − 100/(1+RS)`. Edge cases: all-gains→100, all-losses→0, flat→50 (not 0/0 NaN). |
| **MACD** | fast 12, slow 26, signal 9 | macd at `slow-1`; signal at `slow-1+signal-1` (=33) | `macd = EMA_fast − EMA_slow`; `signal = EMA(signal)` over the *defined* macd values; `hist = macd − signal`. |
| **Bollinger** | period 20, mult 2 | `period-1` | `middle = SMA(period)`; `upper/lower = middle ± mult·stdev(period)` (population stdev). |
| **ATR** | period (14) | `period` | Wilder. `TR = max(high−low, |high−prevClose|, |low−prevClose|)`; TR_0 undefined (no prior close) → seed averages TR over indices 1..period. |
| **ADX** | period (14) | +DI/−DI at `period`; **ADX at `2·period−1`** | Wilder. `+DM/−DM` → smoothed `+DI/−DI`; `DX = 100·|+DI−−DI|/(+DI+−DI)` (guard `+DI+−DI=0 → DX=0`); `ADX = Wilder-smoothed DX`. ADX ∈ [0,100]. |

## IV / RV
- **Strategy IV**: |notional|-weighted average of per-leg mark IVs (backend
  `quant/iv.py`, persisted per minute as `strategy_iv`).
- **RV** (`quant/rv.py`): close-to-close log-return stdev, annualized.
  - intraday: 1-minute closes over `RV_INTRADAY_WINDOW_MINUTES` (default 60),
    annualized ×√(365·1440). Persisted as `rv_intraday`.
  - historical: daily closes over `RV_HISTORICAL_WINDOW_DAYS` (default 30),
    annualized ×√365. Persisted as `rv_historical`.
  - **Data-source note**: `rv_intraday` comes from our own `ticks_minute` (always
    available); `rv_historical` from `ticks_minute` daily rollup is `NULL` until the
    DB accrues ~30 days of bars — the `/mtm` endpoint meanwhile sources historical RV
    from Delta `get_candles`. The RV panel renders whichever window has data and
    shows "—" for the rest.
- **Vol cone (mini)**: ATM IV per expiry for the underlying, with current RV
  overlaid — a quick read of where IV is rich/cheap vs realized.

## Where it's wired
`IndicatorPanel` drives `SpotChart` (candles + EMA/BBands overlays; ADX/RSI/MACD/ATR
oscillator subpanes; **ADX(14) on by default**), reused as `OptionPremiumChart`.
`PositionGreeksChart` / `PositionIVChart` / `RVPanel` / `VolConeMini` read the
`/positions/{id}/timeseries` + `/mtm` endpoints and live under the detail tabs:
**Overview | PnL | Greeks | IV/RV | Spot**.
