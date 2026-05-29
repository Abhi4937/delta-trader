import type { Bar } from "./index";

/**
 * Exponential Moving Average of close prices.
 *
 * Seed: the first EMA value is the SMA of the first `period` closes, placed at
 * index `period - 1`. Everything before that is `null` (warm-up). Thereafter:
 *   EMA_i = close_i * k + EMA_{i-1} * (1 - k),  k = 2 / (period + 1)
 *
 * Output length == input length.
 */
export function ema(bars: Bar[], period: number): (number | null)[] {
  const n = bars.length;
  const out: (number | null)[] = new Array(n).fill(null);
  if (period <= 0 || n < period) return out;

  const k = 2 / (period + 1);

  // Seed with SMA of the first `period` closes.
  let sum = 0;
  for (let i = 0; i < period; i++) sum += bars[i].close;
  let prev = sum / period;
  out[period - 1] = prev;

  for (let i = period; i < n; i++) {
    prev = bars[i].close * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}
