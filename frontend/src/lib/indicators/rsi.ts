import type { Bar } from "./index";

/**
 * Relative Strength Index with Wilder's smoothing (the classic RSI).
 *
 * Warm-up: needs `period` price *changes*, i.e. `period + 1` bars. The first
 * defined value lands at index `period` (seeded from the simple average of the
 * first `period` gains/losses). Indices 0..period-1 are `null`.
 *
 * Wilder smoothing after the seed:
 *   avgGain_i = (avgGain_{i-1} * (period - 1) + gain_i) / period
 *   avgLoss_i = (avgLoss_{i-1} * (period - 1) + loss_i) / period
 *   RS = avgGain / avgLoss;  RSI = 100 - 100 / (1 + RS)
 *
 * Edge cases:
 *  - avgLoss == 0 (only gains)  -> RSI = 100
 *  - avgGain == 0 (only losses) -> RSI = 0
 *  - flat (both 0)              -> RSI = 50 (neutral, avoids 0/0 -> NaN)
 *
 * Output length == input length.
 */
export function rsi(bars: Bar[], period = 14): (number | null)[] {
  const n = bars.length;
  const out: (number | null)[] = new Array(n).fill(null);
  if (period <= 0 || n < period + 1) return out;

  // Seed: average of the first `period` changes (indices 1..period).
  let gainSum = 0;
  let lossSum = 0;
  for (let i = 1; i <= period; i++) {
    const change = bars[i].close - bars[i - 1].close;
    if (change > 0) gainSum += change;
    else lossSum += -change;
  }
  let avgGain = gainSum / period;
  let avgLoss = lossSum / period;
  out[period] = rsiFrom(avgGain, avgLoss);

  for (let i = period + 1; i < n; i++) {
    const change = bars[i].close - bars[i - 1].close;
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? -change : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    out[i] = rsiFrom(avgGain, avgLoss);
  }
  return out;
}

function rsiFrom(avgGain: number, avgLoss: number): number {
  if (avgLoss === 0 && avgGain === 0) return 50; // flat -> neutral
  if (avgLoss === 0) return 100;
  if (avgGain === 0) return 0;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}
