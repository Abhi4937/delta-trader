import { describe, expect, it } from "vitest";
import {
  adx,
  atr,
  bbands,
  ema,
  macd,
  rsi,
  type Bar,
} from "../../src/lib/indicators";

// ---------------------------------------------------------------------------
// Helpers to build deterministic series.
// ---------------------------------------------------------------------------
function closeBars(closes: number[]): Bar[] {
  // OHLC collapsed to the close (fine for close-only indicators: EMA/RSI/MACD/BB).
  return closes.map((c, i) => ({
    time: i,
    open: c,
    high: c,
    low: c,
    close: c,
  }));
}

/** Steady up-trend with a constant 4-wide range — used for ATR/ADX references. */
function trendingBars(n: number): Bar[] {
  const bars: Bar[] = [];
  for (let i = 0; i < n; i++) {
    const base = 100 + i;
    bars.push({
      time: i,
      open: base,
      high: base + 2,
      low: base - 2,
      close: base + 1,
    });
  }
  return bars;
}

function nonNull(xs: (number | null)[]): number[] {
  return xs.filter((x): x is number => x !== null);
}

// ===========================================================================
// EMA
// ===========================================================================
describe("ema", () => {
  it("warm-up is null, first value at index period-1, output aligned", () => {
    const bars = closeBars([1, 2, 3, 4, 5, 6]);
    const out = ema(bars, 3);
    expect(out).toHaveLength(bars.length);
    expect(out[0]).toBeNull();
    expect(out[1]).toBeNull();
    // Seed = SMA of [1,2,3] = 2 at index 2.
    expect(out[2]).toBeCloseTo(2, 10);
  });

  it("on a linear ramp EMA equals the lag-corrected ramp", () => {
    // Hand/Node-verified: EMA(3) of [1..6] -> [null,null,2,3,4,5].
    const out = ema(closeBars([1, 2, 3, 4, 5, 6]), 3);
    expect(out[3]).toBeCloseTo(3, 10);
    expect(out[4]).toBeCloseTo(4, 10);
    expect(out[5]).toBeCloseTo(5, 10);
  });

  it("constant series -> EMA equals the constant", () => {
    const out = ema(closeBars([5, 5, 5, 5, 5]), 3);
    expect(out[2]).toBeCloseTo(5, 10);
    expect(out[4]).toBeCloseTo(5, 10);
  });

  it("returns all-null when shorter than the period (no NaN)", () => {
    const out = ema(closeBars([1, 2]), 5);
    expect(out).toEqual([null, null]);
  });
});

// ===========================================================================
// RSI (Wilder)
// ===========================================================================
describe("rsi", () => {
  // Classic Wilder series (New Concepts in Technical Trading Systems).
  const wilder = [
    44.34, 44.09, 44.15, 43.61, 44.33, 44.83, 45.1, 45.42, 45.84, 46.08, 45.89,
    46.03, 45.61, 46.28, 46.28, 46.0, 46.03, 46.41, 46.22, 45.64,
  ];

  it("first defined value at index 14 (~70.46), warm-up null", () => {
    const out = rsi(closeBars(wilder), 14);
    expect(out).toHaveLength(wilder.length);
    for (let i = 0; i < 14; i++) expect(out[i]).toBeNull();
    expect(out[14]).toBeCloseTo(70.4641, 3);
    expect(out[15]).toBeCloseTo(66.2496, 3);
  });

  it("all-gains -> RSI 100, all-losses -> RSI 0 (edge cases, no NaN)", () => {
    const up = rsi(closeBars([1, 2, 3, 4, 5, 6]), 3);
    expect(nonNull(up).every((v) => v === 100)).toBe(true);
    const down = rsi(closeBars([6, 5, 4, 3, 2, 1]), 3);
    expect(nonNull(down).every((v) => v === 0)).toBe(true);
  });

  it("flat series -> neutral 50 (avoids 0/0 NaN)", () => {
    const out = rsi(closeBars([3, 3, 3, 3, 3, 3]), 3);
    expect(out[3]).toBeCloseTo(50, 10);
  });

  it("every defined value is within [0,100]", () => {
    const out = rsi(closeBars(wilder), 14);
    for (const v of nonNull(out)) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(100);
    }
  });
});

// ===========================================================================
// MACD
// ===========================================================================
describe("macd", () => {
  const closes = Array.from({ length: 60 }, (_, i) => 100 + Math.sin(i / 3) * 5);

  it("output arrays aligned to input length", () => {
    const { macd: m, signal, hist } = macd(closeBars(closes));
    expect(m).toHaveLength(closes.length);
    expect(signal).toHaveLength(closes.length);
    expect(hist).toHaveLength(closes.length);
  });

  it("macd null until slow EMA defined (index slow-1 = 25)", () => {
    const { macd: m } = macd(closeBars(closes), 12, 26, 9);
    expect(m[24]).toBeNull();
    expect(m[25]).not.toBeNull();
  });

  it("hist == macd - signal wherever both are defined", () => {
    const { macd: m, signal, hist } = macd(closeBars(closes), 12, 26, 9);
    for (let i = 0; i < closes.length; i++) {
      if (m[i] !== null && signal[i] !== null) {
        expect(hist[i]).not.toBeNull();
        expect(hist[i] as number).toBeCloseTo(
          (m[i] as number) - (signal[i] as number),
          10,
        );
      } else {
        expect(hist[i]).toBeNull();
      }
    }
  });

  it("signal first defined 8 macd-points after macd starts (25 + 8 = 33)", () => {
    const { signal } = macd(closeBars(closes), 12, 26, 9);
    expect(signal[32]).toBeNull();
    expect(signal[33]).not.toBeNull();
  });
});

// ===========================================================================
// Bollinger Bands
// ===========================================================================
describe("bbands", () => {
  it("middle band equals the SMA; first defined at index period-1", () => {
    const closes = [2, 4, 6, 8, 10, 12, 14];
    const period = 3;
    const { upper, middle, lower } = bbands(closeBars(closes), period, 2);
    expect(middle).toHaveLength(closes.length);
    expect(middle[0]).toBeNull();
    expect(middle[1]).toBeNull();
    for (let i = period - 1; i < closes.length; i++) {
      let sum = 0;
      for (let j = i - period + 1; j <= i; j++) sum += closes[j];
      expect(middle[i] as number).toBeCloseTo(sum / period, 10);
    }
    // upper >= middle >= lower everywhere defined.
    for (let i = period - 1; i < closes.length; i++) {
      expect(upper[i] as number).toBeGreaterThanOrEqual(middle[i] as number);
      expect(middle[i] as number).toBeGreaterThanOrEqual(lower[i] as number);
    }
  });

  it("constant series -> zero width, all three bands equal", () => {
    const { upper, middle, lower } = bbands(closeBars([5, 5, 5, 5]), 3, 2);
    expect(upper[3] as number).toBeCloseTo(5, 10);
    expect(middle[3] as number).toBeCloseTo(5, 10);
    expect(lower[3] as number).toBeCloseTo(5, 10);
  });

  it("known stddev: [2,4,6] population sd = sqrt(8/3)", () => {
    const { upper, middle, lower } = bbands(closeBars([2, 4, 6]), 3, 2);
    const sd = Math.sqrt(8 / 3);
    expect(middle[2] as number).toBeCloseTo(4, 10);
    expect(upper[2] as number).toBeCloseTo(4 + 2 * sd, 10);
    expect(lower[2] as number).toBeCloseTo(4 - 2 * sd, 10);
  });
});

// ===========================================================================
// ATR (Wilder)
// ===========================================================================
describe("atr", () => {
  it("warm-up null, first value at index period, constant-range series -> ATR=4", () => {
    const bars = trendingBars(40);
    const out = atr(bars, 14);
    expect(out).toHaveLength(40);
    for (let i = 0; i < 14; i++) expect(out[i]).toBeNull();
    // Each bar: range=4, gap-ups keep TR=4, so ATR stabilizes at exactly 4.
    expect(out[14] as number).toBeCloseTo(4, 6);
    expect(out[39] as number).toBeCloseTo(4, 6);
  });

  it("returns all-null when shorter than period+1", () => {
    const out = atr(trendingBars(10), 14);
    expect(out.every((v) => v === null)).toBe(true);
  });
});

// ===========================================================================
// ADX (Wilder)
// ===========================================================================
describe("adx", () => {
  it("warm-up null; ADX seeds at index 2*period-1; pure up-trend -> ADX=100", () => {
    const bars = trendingBars(40);
    const { adx: a, plusDI, minusDI } = adx(bars, 14);
    expect(a).toHaveLength(40);
    // +DI/-DI defined from index 14; ADX from 27.
    for (let i = 0; i < 14; i++) {
      expect(plusDI[i]).toBeNull();
      expect(minusDI[i]).toBeNull();
    }
    for (let i = 0; i < 27; i++) expect(a[i]).toBeNull();
    expect(a[27]).not.toBeNull();
    // Pure up-trend: +DI dominates, -DI = 0 -> DX = 100 -> ADX = 100.
    expect(plusDI[14] as number).toBeCloseTo(25, 6);
    expect(minusDI[14] as number).toBeCloseTo(0, 6);
    expect(a[27] as number).toBeCloseTo(100, 6);
    expect(a[39] as number).toBeCloseTo(100, 6);
  });

  it("every defined ADX value is within [0,100]", () => {
    // A choppier series so ADX is not pinned at the extreme.
    const closes = Array.from({ length: 80 }, (_, i) =>
      100 + Math.sin(i / 2) * 10,
    );
    const bars: Bar[] = closes.map((c, i) => ({
      time: i,
      open: c,
      high: c + 1,
      low: c - 1,
      close: c,
    }));
    const { adx: a, plusDI, minusDI } = adx(bars, 14);
    for (const v of nonNull(a)) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(100);
    }
    for (const v of nonNull(plusDI)) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(100);
    }
    for (const v of nonNull(minusDI)) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(100);
    }
  });

  it("returns all-null when shorter than period+1", () => {
    const { adx: a } = adx(trendingBars(10), 14);
    expect(a.every((v) => v === null)).toBe(true);
  });
});
