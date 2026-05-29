import type { Bar } from "./index";

export interface BBandsResult {
  upper: (number | null)[];
  middle: (number | null)[];
  lower: (number | null)[];
}

/**
 * Bollinger Bands(period=20, mult=2).
 *
 *   middle_i = SMA(close, period)_i
 *   sd_i     = population standard deviation of the last `period` closes
 *   upper_i  = middle_i + mult * sd_i
 *   lower_i  = middle_i - mult * sd_i
 *
 * Uses the POPULATION standard deviation (divide by N), which is the standard
 * Bollinger convention. The first defined value is at index `period - 1`; all
 * earlier indices are `null`. Output length == input length.
 */
export function bbands(
  bars: Bar[],
  period = 20,
  mult = 2,
): BBandsResult {
  const n = bars.length;
  const upper: (number | null)[] = new Array(n).fill(null);
  const middle: (number | null)[] = new Array(n).fill(null);
  const lower: (number | null)[] = new Array(n).fill(null);
  if (period <= 0 || n < period) return { upper, middle, lower };

  for (let i = period - 1; i < n; i++) {
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) sum += bars[j].close;
    const mean = sum / period;

    let sqSum = 0;
    for (let j = i - period + 1; j <= i; j++) {
      const d = bars[j].close - mean;
      sqSum += d * d;
    }
    const sd = Math.sqrt(sqSum / period); // population stddev

    middle[i] = mean;
    upper[i] = mean + mult * sd;
    lower[i] = mean - mult * sd;
  }
  return { upper, middle, lower };
}
