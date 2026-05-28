import { describe, expect, it } from "vitest";
import { Decimal } from "../../src/lib/decimal";
import {
  breakevens,
  estimatedSlippageCost,
  maxProfitLoss,
  netGreeks,
  signedQty,
  type MathLeg,
} from "../../src/lib/strategy-math";

const CS = new Decimal("0.001");

function leg(partial: Partial<MathLeg> & Pick<MathLeg, "symbol" | "side">): MathLeg {
  return {
    qty: new Decimal(1),
    contractSize: CS,
    ...partial,
  };
}

describe("signedQty", () => {
  it("buy is positive, sell is negative", () => {
    expect(signedQty("buy", new Decimal(2)).toNumber()).toBe(2);
    expect(signedQty("sell", new Decimal(2)).toNumber()).toBe(-2);
  });
});

describe("netGreeks", () => {
  it("a short leg subtracts (sign correctness)", () => {
    const longCall = leg({
      symbol: "C-BTC-90000-290526",
      side: "buy",
      delta: new Decimal("0.5"),
      theta: new Decimal("-10"),
    });
    const shortCall = leg({
      symbol: "C-BTC-90000-290526",
      side: "sell",
      delta: new Decimal("0.5"),
      theta: new Decimal("-10"),
    });

    const long = netGreeks([longCall]);
    // 1 * 0.001 * 0.5 = 0.0005
    expect(long.delta.toNumber()).toBeCloseTo(0.0005, 10);
    // long option theta is negative
    expect(long.theta.toNumber()).toBeCloseTo(-0.01, 10);

    const short = netGreeks([shortCall]);
    // short flips sign: delta negative, theta positive (collect time decay)
    expect(short.delta.toNumber()).toBeCloseTo(-0.0005, 10);
    expect(short.theta.toNumber()).toBeCloseTo(0.01, 10);
  });

  it("a short straddle has near-zero delta and positive theta", () => {
    const legs: MathLeg[] = [
      leg({
        symbol: "C-BTC-100000-290526",
        side: "sell",
        delta: new Decimal("0.5"),
        theta: new Decimal("-12"),
      }),
      leg({
        symbol: "P-BTC-100000-290526",
        side: "sell",
        delta: new Decimal("-0.5"),
        theta: new Decimal("-12"),
      }),
    ];
    const g = netGreeks(legs);
    expect(g.delta.toNumber()).toBeCloseTo(0, 10);
    expect(g.theta.isPositive()).toBe(true);
  });

  it("missing greeks contribute zero", () => {
    const g = netGreeks([leg({ symbol: "C-BTC-90000-290526", side: "buy" })]);
    expect(g.delta.toNumber()).toBe(0);
    expect(g.vega.toNumber()).toBe(0);
  });
});

describe("estimatedSlippageCost", () => {
  it("sums absolute impact * qty * contract_size", () => {
    const cost = estimatedSlippageCost([
      { impact: "2", qty: "1", contract_size: "0.001" },
      { impact: "-3", qty: "2", contract_size: "0.001" },
    ]);
    // |2*1*0.001| + |-3*2*0.001| = 0.002 + 0.006 = 0.008
    expect(cost.toNumber()).toBeCloseTo(0.008, 12);
  });
});

describe("maxProfitLoss & breakevens (bull call spread)", () => {
  // Long 1x 100 call @ mark 8, short 1x 110 call @ mark 3. Net debit per contract
  // (in spot terms): 8 - 3 = 5. Use contract_size 1 for simple readable numbers.
  const one = new Decimal(1);
  const legs: MathLeg[] = [
    {
      symbol: "C-BTC-100-290526",
      side: "buy",
      qty: one,
      contractSize: one,
      mark: new Decimal("8"),
    },
    {
      symbol: "C-BTC-110-290526",
      side: "sell",
      qty: one,
      contractSize: one,
      mark: new Decimal("3"),
    },
  ];

  it("max loss = net debit (negative), max profit = width - debit", () => {
    const { maxProfit, maxLoss } = maxProfitLoss(legs);
    expect(maxLoss).not.toBeNull();
    expect(maxProfit).not.toBeNull();
    // net debit = 5 -> max loss = -5
    expect(maxLoss!.toNumber()).toBeCloseTo(-5, 6);
    // width 10 - debit 5 = +5 max profit
    expect(maxProfit!.toNumber()).toBeCloseTo(5, 6);
  });

  it("breakeven = lower strike + net debit = 105", () => {
    const bes = breakevens(legs);
    expect(bes.length).toBeGreaterThanOrEqual(1);
    expect(bes[0].toNumber()).toBeCloseTo(105, 6);
  });
});

describe("payoff helpers with no priced legs", () => {
  it("returns nulls/empty when marks are missing", () => {
    const legs: MathLeg[] = [leg({ symbol: "C-BTC-90000-290526", side: "buy" })];
    const { maxProfit, maxLoss } = maxProfitLoss(legs);
    expect(maxProfit).toBeNull();
    expect(maxLoss).toBeNull();
    expect(breakevens(legs)).toEqual([]);
  });
});
