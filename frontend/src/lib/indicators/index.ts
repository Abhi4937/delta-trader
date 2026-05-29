// Technical indicators — PURE functions of a price series (ADR 0005 §1).
//
// Every indicator has the signature `(bars: Bar[], params) => (number|null)[]`
// (or an object of such arrays for multi-line indicators), with the output array
// aligned 1:1 to the input bars. Entries in the warm-up region (before the
// indicator has enough history to be defined) are `null` — NEVER NaN — so the
// chart layer can skip them cleanly.
//
// These operate on `number` (float) on purpose: indicators are statistical, not
// money. Money/greeks stay Decimal everywhere else (hard rule #3).
//
// ---------------------------------------------------------------------------
// Incremental append note (ADR 0005 §1 "incremental recompute")
// ---------------------------------------------------------------------------
// EMA / RSI / ATR / ADX / MACD are recurrence relations: value[i] depends only
// on value[i-1] (and a small fixed lookback). So when the chart appends ONE new
// closed bar, it does NOT need to recompute the whole history — it can recompute
// only the affected tail. The simplest robust approach (used by SpotChart) is to
// keep a bounded rolling window of the last N bars and recompute the indicator on
// that window only; because the window is capped (e.g. 360 bars) this is O(N)
// with small constant per tick, not O(total history). The pure functions below
// are deliberately cheap and side-effect free so the chart can call them on the
// tail window each 1Hz update without rebuilding any server-side state.

export interface Bar {
  time: number; // unix seconds
  open: number;
  high: number;
  low: number;
  close: number;
}

export { ema } from "./ema";
export { rsi } from "./rsi";
export { macd, type MacdResult } from "./macd";
export { bbands, type BBandsResult } from "./bbands";
export { atr } from "./atr";
export { adx, type AdxResult } from "./adx";
