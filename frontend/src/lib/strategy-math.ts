// Pure strategy math helpers, mirrored from the Phase 2 backend quant code
// (ADR 0003 §1, §4, §8). All money/greeks are Decimal — never float.
//
// These power the StrategyBuilder footer's *client-side* preview (net greeks,
// payoff, slippage) BEFORE the user asks the backend for its authoritative
// preview. The modal always uses the backend numbers for fills/margin.

import { Decimal } from "./decimal";
import { parseSymbol } from "./symbols";

export type Side = "buy" | "sell";

/** A leg as the builder knows it (greeks pulled from the option chain). */
export interface MathLeg {
  symbol: string;
  side: Side;
  /** requested contracts, always > 0 */
  qty: Decimal;
  /** per-product multiplier (e.g. 0.001 for BTC options) */
  contractSize: Decimal;
  /** per-contract greeks from the chain (null when missing) */
  delta?: Decimal | null;
  gamma?: Decimal | null;
  theta?: Decimal | null;
  vega?: Decimal | null;
  /** per-contract mark used for payoff entry credit/debit */
  mark?: Decimal | null;
}

export interface NetGreeks {
  delta: Decimal;
  gamma: Decimal;
  theta: Decimal;
  vega: Decimal;
}

/** Sign convention (ADR 0003 §1): sell carries negative qty everywhere. */
export function signedQty(side: Side, qty: Decimal): Decimal {
  return side === "buy" ? qty : qty.negated();
}

/**
 * Net signed greeks (ADR 0003 §4):
 *   net_g = Σ signed_qty * contract_size * leg_g
 * Legs with a missing greek contribute 0 for that greek.
 */
export function netGreeks(legs: MathLeg[]): NetGreeks {
  let delta = new Decimal(0);
  let gamma = new Decimal(0);
  let theta = new Decimal(0);
  let vega = new Decimal(0);
  for (const leg of legs) {
    const sq = signedQty(leg.side, leg.qty).times(leg.contractSize);
    if (leg.delta) delta = delta.plus(sq.times(leg.delta));
    if (leg.gamma) gamma = gamma.plus(sq.times(leg.gamma));
    if (leg.theta) theta = theta.plus(sq.times(leg.theta));
    if (leg.vega) vega = vega.plus(sq.times(leg.vega));
  }
  return { delta, gamma, theta, vega };
}

/**
 * Estimated slippage cost from a backend preview's per-leg impact:
 *   Σ |impact * qty * contract_size|
 */
export interface PreviewImpactLeg {
  impact: string | number;
  qty: string | number;
  contract_size: string | number;
}
export function estimatedSlippageCost(previewLegs: PreviewImpactLeg[]): Decimal {
  let total = new Decimal(0);
  for (const leg of previewLegs) {
    const impact = new Decimal(leg.impact);
    const qty = new Decimal(leg.qty);
    const cs = new Decimal(leg.contract_size);
    total = total.plus(impact.times(qty).times(cs).abs());
  }
  return total;
}

// ---------------------------------------------------------------------------
// Payoff-at-expiry helpers (options only).
// ---------------------------------------------------------------------------

interface OptionLeg {
  side: Side;
  qty: Decimal;
  contractSize: Decimal;
  strike: Decimal;
  right: "C" | "P";
  mark: Decimal;
}

/** Keep only legs we can parse as priced options. */
function optionLegs(legs: MathLeg[]): OptionLeg[] {
  const out: OptionLeg[] = [];
  for (const leg of legs) {
    const parsed = parseSymbol(leg.symbol);
    if (!parsed) continue;
    const mark = leg.mark ?? null;
    if (mark === null) continue;
    out.push({
      side: leg.side,
      qty: leg.qty,
      contractSize: leg.contractSize,
      strike: new Decimal(parsed.strike),
      right: parsed.side,
      mark,
    });
  }
  return out;
}

/** Per-contract intrinsic payoff at expiry for one option right. */
function legPayoff(leg: OptionLeg, spot: Decimal): Decimal {
  if (leg.right === "C") return Decimal.max(spot.minus(leg.strike), 0);
  return Decimal.max(leg.strike.minus(spot), 0);
}

/**
 * Net entry credit (positive) / debit (negative) of the structure, valued at
 * the per-leg marks. A sold leg credits premium; a bought leg debits it.
 *   credit = Σ -signed_qty * mark * contract_size
 * (sell => signed_qty negative => +mark*qty*cs received)
 */
function netEntryCredit(legs: OptionLeg[]): Decimal {
  let credit = new Decimal(0);
  for (const leg of legs) {
    const sq = signedQty(leg.side, leg.qty);
    credit = credit.plus(sq.negated().times(leg.mark).times(leg.contractSize));
  }
  return credit;
}

/** Total P/L of the structure at a given terminal spot (incl. entry credit). */
function payoffAt(legs: OptionLeg[], spot: Decimal, credit: Decimal): Decimal {
  let pnl = credit;
  for (const leg of legs) {
    const sq = signedQty(leg.side, leg.qty).times(leg.contractSize);
    pnl = pnl.plus(sq.times(legPayoff(leg, spot)));
  }
  return pnl;
}

/** Build a dense strike grid: 0, each strike +/- a step, and a high cap. */
function strikeGrid(legs: OptionLeg[]): Decimal[] {
  const strikes = Array.from(
    new Set(legs.map((l) => l.strike.toString())),
  ).map((s) => new Decimal(s));
  strikes.sort((a, b) => a.minus(b).toNumber());
  if (strikes.length === 0) return [];
  const max = strikes[strikes.length - 1];
  const grid: Decimal[] = [new Decimal(0)];
  // Sample midpoints between strikes plus the strikes themselves so kinks are hit.
  for (let i = 0; i < strikes.length; i++) {
    if (i > 0) {
      grid.push(strikes[i - 1].plus(strikes[i]).dividedBy(2));
    }
    grid.push(strikes[i]);
  }
  grid.push(max.times(2));
  return grid;
}

export interface MaxProfitLoss {
  /** most positive payoff over the grid; null if no priced option legs */
  maxProfit: Decimal | null;
  /** most negative payoff over the grid; null if no priced option legs */
  maxLoss: Decimal | null;
}

/**
 * Max profit / loss of the payoff at expiry over a strike grid (ADR 0003 §8
 * worst-case-loss style). Returns nulls when there are no priced option legs.
 */
export function maxProfitLoss(legs: MathLeg[]): MaxProfitLoss {
  const opt = optionLegs(legs);
  if (opt.length === 0) return { maxProfit: null, maxLoss: null };
  const credit = netEntryCredit(opt);
  const grid = strikeGrid(opt);
  let maxProfit: Decimal | null = null;
  let maxLoss: Decimal | null = null;
  for (const s of grid) {
    const p = payoffAt(opt, s, credit);
    if (maxProfit === null || p.greaterThan(maxProfit)) maxProfit = p;
    if (maxLoss === null || p.lessThan(maxLoss)) maxLoss = p;
  }
  return { maxProfit, maxLoss };
}

/**
 * Breakevens: terminal spots where total payoff crosses zero. Scans the grid
 * for sign changes and linearly interpolates the crossing. Returns [] when
 * there are no priced option legs or no crossing.
 */
export function breakevens(legs: MathLeg[]): Decimal[] {
  const opt = optionLegs(legs);
  if (opt.length === 0) return [];
  const credit = netEntryCredit(opt);
  const grid = strikeGrid(opt);
  const out: Decimal[] = [];
  for (let i = 1; i < grid.length; i++) {
    const s0 = grid[i - 1];
    const s1 = grid[i];
    const p0 = payoffAt(opt, s0, credit);
    const p1 = payoffAt(opt, s1, credit);
    if (p0.isZero()) {
      out.push(s0);
      continue;
    }
    if (p0.s !== p1.s && !p0.isZero() && !p1.isZero()) {
      // sign change between s0 and s1 — linear interpolation of the crossing.
      const span = p1.minus(p0);
      if (!span.isZero()) {
        const t = p0.negated().dividedBy(span);
        out.push(s0.plus(s1.minus(s0).times(t)));
      }
    }
  }
  // de-dup near-identical crossings
  const dedup: Decimal[] = [];
  for (const b of out) {
    if (!dedup.some((d) => d.minus(b).abs().lessThan(new Decimal("0.5")))) {
      dedup.push(b);
    }
  }
  return dedup;
}
