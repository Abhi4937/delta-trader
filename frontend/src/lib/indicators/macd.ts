import type { Bar } from "./index";
import { ema } from "./ema";

export interface MacdResult {
  macd: (number | null)[];
  signal: (number | null)[];
  hist: (number | null)[];
}

/**
 * MACD(fast=12, slow=26, signal=9).
 *
 *   macd_i   = EMA_fast(close)_i - EMA_slow(close)_i
 *   signal_i = EMA_signal(macd)
 *   hist_i   = macd_i - signal_i
 *
 * Warm-up handling:
 *  - `macd` is null until the slow EMA is defined (index slow-1).
 *  - `signal` is an EMA computed over the *defined* macd values only, seeded from
 *    the SMA of the first `signal` macd values; it lands `signal-1` macd-points
 *    after the macd line starts (i.e. global index slow-1 + signal-1).
 *  - `hist` is null wherever either macd or signal is null; elsewhere it is
 *    exactly macd - signal (asserted in tests).
 *
 * All three arrays have length == input length.
 */
export function macd(
  bars: Bar[],
  fast = 12,
  slow = 26,
  signalPeriod = 9,
): MacdResult {
  const n = bars.length;
  const emaFast = ema(bars, fast);
  const emaSlow = ema(bars, slow);

  const macdLine: (number | null)[] = new Array(n).fill(null);
  for (let i = 0; i < n; i++) {
    const f = emaFast[i];
    const s = emaSlow[i];
    if (f !== null && s !== null) macdLine[i] = f - s;
  }

  // Signal = EMA(signalPeriod) over the contiguous defined macd values.
  const signal: (number | null)[] = new Array(n).fill(null);
  const k = 2 / (signalPeriod + 1);
  let prev: number | null = null;
  let seedCount = 0;
  let seedSum = 0;
  let firstDefined = -1;
  for (let i = 0; i < n; i++) {
    const m = macdLine[i];
    if (m === null) continue;
    if (firstDefined === -1) firstDefined = i;
    if (prev === null) {
      // accumulate the SMA seed over the first `signalPeriod` macd values
      seedSum += m;
      seedCount++;
      if (seedCount === signalPeriod) {
        prev = seedSum / signalPeriod;
        signal[i] = prev;
      }
    } else {
      prev = m * k + prev * (1 - k);
      signal[i] = prev;
    }
  }

  const hist: (number | null)[] = new Array(n).fill(null);
  for (let i = 0; i < n; i++) {
    const m = macdLine[i];
    const s = signal[i];
    if (m !== null && s !== null) hist[i] = m - s;
  }

  return { macd: macdLine, signal, hist };
}
