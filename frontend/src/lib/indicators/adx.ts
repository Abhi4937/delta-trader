import type { Bar } from "./index";
import { trueRange } from "./atr";

export interface AdxResult {
  adx: (number | null)[];
  plusDI: (number | null)[];
  minusDI: (number | null)[];
}

/**
 * Average Directional Index(period=14) with +DI/-DI, Wilder smoothing.
 *
 * Directional movement for bar i (i>=1):
 *   upMove   = high_i - high_{i-1}
 *   downMove = low_{i-1} - low_i
 *   +DM = upMove   if (upMove > downMove and upMove > 0)   else 0
 *   -DM = downMove if (downMove > upMove and downMove > 0) else 0
 *
 * Wilder-smoothed TR/+DM/-DM are seeded at index `period` as the SUM of the
 * first `period` raw values (indices 1..period), then smoothed:
 *   sm_i = sm_{i-1} - sm_{i-1}/period + raw_i
 *
 * Then:
 *   +DI = 100 * smPlusDM / smTR
 *   -DI = 100 * smMinusDM / smTR
 *   DX  = 100 * |+DI - -DI| / (+DI + -DI)      (DX = 0 if +DI + -DI == 0)
 *
 * +DI/-DI are defined from index `period` onward. ADX is the Wilder average of
 * DX: seeded at index `2*period - 1` as the mean of the first `period` DX values
 * (DX exists from index `period`), then smoothed:
 *   ADX_i = (ADX_{i-1} * (period - 1) + DX_i) / period
 *
 * So +DI/-DI warm-up = `period` bars, ADX warm-up ≈ `2*period - 1` bars; all
 * earlier indices are `null`. ADX is always within [0, 100]. Output length ==
 * input length for all three arrays.
 */
export function adx(bars: Bar[], period = 14): AdxResult {
  const n = bars.length;
  const adxArr: (number | null)[] = new Array(n).fill(null);
  const plusDI: (number | null)[] = new Array(n).fill(null);
  const minusDI: (number | null)[] = new Array(n).fill(null);
  if (period <= 0 || n < period + 1) {
    return { adx: adxArr, plusDI, minusDI };
  }

  // Raw per-bar TR / +DM / -DM (indices 1..n-1; index 0 unused).
  const tr: number[] = new Array(n).fill(0);
  const plusDM: number[] = new Array(n).fill(0);
  const minusDM: number[] = new Array(n).fill(0);
  for (let i = 1; i < n; i++) {
    const upMove = bars[i].high - bars[i - 1].high;
    const downMove = bars[i - 1].low - bars[i].low;
    plusDM[i] = upMove > downMove && upMove > 0 ? upMove : 0;
    minusDM[i] = downMove > upMove && downMove > 0 ? downMove : 0;
    tr[i] = trueRange(bars[i], bars[i - 1]);
  }

  // Wilder seed at index `period`: sum of the first `period` raw values.
  let smTR = 0;
  let smPlus = 0;
  let smMinus = 0;
  for (let i = 1; i <= period; i++) {
    smTR += tr[i];
    smPlus += plusDM[i];
    smMinus += minusDM[i];
  }

  // dxValues collected from index `period` onward to seed ADX.
  const dxAtIndex: (number | null)[] = new Array(n).fill(null);

  const computeDI = (idx: number): void => {
    const pdi = smTR === 0 ? 0 : (100 * smPlus) / smTR;
    const mdi = smTR === 0 ? 0 : (100 * smMinus) / smTR;
    plusDI[idx] = pdi;
    minusDI[idx] = mdi;
    const denom = pdi + mdi;
    dxAtIndex[idx] = denom === 0 ? 0 : (100 * Math.abs(pdi - mdi)) / denom;
  };

  computeDI(period);

  for (let i = period + 1; i < n; i++) {
    smTR = smTR - smTR / period + tr[i];
    smPlus = smPlus - smPlus / period + plusDM[i];
    smMinus = smMinus - smMinus / period + minusDM[i];
    computeDI(i);
  }

  // ADX: seed at index 2*period-1 with the mean of DX over indices period..2*period-1.
  const adxSeedIdx = 2 * period - 1;
  if (adxSeedIdx < n) {
    let dxSum = 0;
    for (let i = period; i <= adxSeedIdx; i++) {
      dxSum += dxAtIndex[i] ?? 0;
    }
    let prevAdx = dxSum / period;
    adxArr[adxSeedIdx] = prevAdx;
    for (let i = adxSeedIdx + 1; i < n; i++) {
      const dx = dxAtIndex[i] ?? 0;
      prevAdx = (prevAdx * (period - 1) + dx) / period;
      adxArr[i] = prevAdx;
    }
  }

  return { adx: adxArr, plusDI, minusDI };
}
