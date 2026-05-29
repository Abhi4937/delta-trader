import type { Bar } from "./index";

/**
 * True Range for bar `i` (needs bar i-1). For i==0 there is no previous close,
 * so TR_0 = high_0 - low_0.
 *   TR = max(high - low, |high - prevClose|, |low - prevClose|)
 */
export function trueRange(bar: Bar, prev: Bar | null): number {
  if (prev === null) return bar.high - bar.low;
  const a = bar.high - bar.low;
  const b = Math.abs(bar.high - prev.close);
  const c = Math.abs(bar.low - prev.close);
  return Math.max(a, b, c);
}

/**
 * Average True Range(period=14) with Wilder's smoothing.
 *
 * Warm-up: the first ATR is the simple average of TR over bars 1..period
 * (period TR values, since TR_0 is excluded from the seed as it has no prior
 * close in the classic definition). It lands at index `period`. Indices
 * 0..period-1 are `null`.
 *
 * Wilder recursion after the seed:
 *   ATR_i = (ATR_{i-1} * (period - 1) + TR_i) / period
 *
 * Output length == input length.
 */
export function atr(bars: Bar[], period = 14): (number | null)[] {
  const n = bars.length;
  const out: (number | null)[] = new Array(n).fill(null);
  if (period <= 0 || n < period + 1) return out;

  // Seed: average of TR over indices 1..period.
  let sum = 0;
  for (let i = 1; i <= period; i++) {
    sum += trueRange(bars[i], bars[i - 1]);
  }
  let prevAtr = sum / period;
  out[period] = prevAtr;

  for (let i = period + 1; i < n; i++) {
    const tr = trueRange(bars[i], bars[i - 1]);
    prevAtr = (prevAtr * (period - 1) + tr) / period;
    out[i] = prevAtr;
  }
  return out;
}
