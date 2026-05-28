import { useMemo, useState } from "react";
import clsx from "clsx";
import { Plus, Trash2 } from "lucide-react";
import ExpirySelector from "../ExpirySelector";
import { useExpiries } from "../../hooks/useExpiries";
import { useOptionChain } from "../../hooks/useOptionChain";
import { parseSymbol } from "../../lib/symbols";
import { Decimal, fmt, toDecimal } from "../../lib/decimal";
import {
  breakevens,
  estimatedSlippageCost,
  maxProfitLoss,
  netGreeks,
  type MathLeg,
} from "../../lib/strategy-math";
import type { LegSpec, PreviewLeg, StrategySpec } from "../../lib/paperApi";
import type { OptionRow } from "../../lib/api";
import StrategyPreviewModal from "./StrategyPreviewModal";

const UNDERLYING = "BTC";

interface BuilderLeg {
  key: string;
  side: "buy" | "sell";
  qty: string;
  /** chosen expiry code (DD-MM-YYYY) */
  expiry: string | null;
  strike: number | null;
  right: "C" | "P";
}

let legSeq = 0;
function newLeg(expiry: string | null): BuilderLeg {
  legSeq += 1;
  return {
    key: `leg-${legSeq}`,
    side: "sell",
    qty: "1",
    expiry,
    strike: null,
    right: "C",
  };
}

/** Build the wire symbol for a leg from the chain rows for its expiry. */
function symbolFor(
  rows: OptionRow[],
  strike: number | null,
  right: "C" | "P",
): string | null {
  if (strike === null) return null;
  for (const r of rows) {
    const p = parseSymbol(r.symbol);
    if (p && p.strike === strike && p.side === right) return r.symbol;
  }
  return null;
}

function rowFor(
  rows: OptionRow[],
  strike: number | null,
  right: "C" | "P",
): OptionRow | null {
  if (strike === null) return null;
  return (
    rows.find((r) => {
      const p = parseSymbol(r.symbol);
      return p && p.strike === strike && p.side === right;
    }) ?? null
  );
}

const CONTRACT_SIZE = new Decimal("0.001"); // BTC options; preview uses backend's authoritative size

function fmtGreek(d: Decimal, dp = 4): string {
  return d.toFixed(dp);
}

interface StrategyBuilderProps {
  spot: string | null;
}

export default function StrategyBuilder({ spot }: StrategyBuilderProps): JSX.Element {
  const { data: expiries = [], isLoading: expiriesLoading } = useExpiries(UNDERLYING);
  const [defaultExpiry, setDefaultExpiry] = useState<string | null>(null);
  const effectiveDefault = defaultExpiry ?? expiries[0]?.expiry_code ?? null;

  const [legs, setLegs] = useState<BuilderLeg[]>([]);
  const [name, setName] = useState("Untitled strategy");
  const [previewSpec, setPreviewSpec] = useState<StrategySpec | null>(null);

  // Load the chain for whichever expiries are referenced (we just load the
  // builder's default expiry; per-leg expiries reuse the cached query).
  const { rows } = useOptionChain(UNDERLYING, effectiveDefault);

  // distinct strikes available for the default expiry, sorted
  const strikes = useMemo(() => {
    const s = new Set<number>();
    for (const r of rows) {
      const p = parseSymbol(r.symbol);
      if (p) s.add(p.strike);
    }
    return Array.from(s).sort((a, b) => a - b);
  }, [rows]);

  function addLeg(): void {
    setLegs((prev) => [...prev, newLeg(effectiveDefault)]);
  }
  function removeLeg(key: string): void {
    setLegs((prev) => prev.filter((l) => l.key !== key));
  }
  function patchLeg(key: string, patch: Partial<BuilderLeg>): void {
    setLegs((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  // Math legs (client-side footer preview using chain greeks/marks).
  const mathLegs: MathLeg[] = useMemo(() => {
    const out: MathLeg[] = [];
    for (const l of legs) {
      const sym = symbolFor(rows, l.strike, l.right);
      const row = rowFor(rows, l.strike, l.right);
      const qty = toDecimal(l.qty);
      if (!sym || !qty || qty.lessThanOrEqualTo(0)) continue;
      out.push({
        symbol: sym,
        side: l.side,
        qty,
        contractSize: CONTRACT_SIZE,
        delta: toDecimal(row?.delta ?? null),
        gamma: toDecimal(row?.gamma ?? null),
        theta: toDecimal(row?.theta ?? null),
        vega: toDecimal(row?.vega ?? null),
        mark: toDecimal(row?.mark_price ?? null),
      });
    }
    return out;
  }, [legs, rows]);

  const greeks = useMemo(() => netGreeks(mathLegs), [mathLegs]);
  const mpl = useMemo(() => maxProfitLoss(mathLegs), [mathLegs]);
  const bes = useMemo(() => breakevens(mathLegs), [mathLegs]);

  // Estimated slippage from chain marks * a nominal impact is not authoritative;
  // we expose backend-impact slippage in the modal. Here we show a 0 placeholder
  // until preview, derived from preview legs when available.
  const slippage = useMemo(() => {
    const previewLegs: PreviewLeg[] = [];
    return previewLegs.length
      ? estimatedSlippageCost(previewLegs)
      : new Decimal(0);
  }, []);

  const validLegs = mathLegs.length > 0 && mathLegs.length === legs.length;

  function buildSpec(): StrategySpec | null {
    const specLegs: LegSpec[] = [];
    for (const l of legs) {
      const sym = symbolFor(rows, l.strike, l.right);
      const qty = toDecimal(l.qty);
      if (!sym || !qty || qty.lessThanOrEqualTo(0)) return null;
      specLegs.push({ symbol: sym, side: l.side, qty: qty.toString() });
    }
    if (specLegs.length === 0) return null;
    return {
      name: name.trim() || "Untitled strategy",
      underlying: UNDERLYING,
      legs: specLegs,
      atomic: true,
    };
  }

  function openPreview(): void {
    const spec = buildSpec();
    if (spec) setPreviewSpec(spec);
  }

  return (
    <div
      className="flex flex-col rounded border border-[var(--color-border)] bg-[var(--color-panel)]"
      data-testid="strategy-builder"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--color-border)] px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="text-xs text-neutral">Strategy</span>
          <input
            className="w-44 rounded border border-[var(--color-border)] bg-bg px-2 py-1 font-mono text-sm text-text outline-none focus:border-green"
            value={name}
            onChange={(e) => setName(e.target.value)}
            aria-label="Strategy name"
            data-testid="strategy-name"
          />
        </div>
        <div className="flex items-center gap-3">
          <ExpirySelector
            expiries={expiries}
            value={effectiveDefault}
            onChange={setDefaultExpiry}
            disabled={expiriesLoading}
          />
          <span className="text-xs text-neutral">
            Spot <span className="font-mono tabular-nums text-text">{fmt(spot, 2)}</span>
          </span>
        </div>
      </div>

      {/* leg rows */}
      <div className="flex flex-col gap-2 p-3">
        {legs.length === 0 && (
          <div className="py-4 text-center text-sm text-neutral">
            No legs yet — add a leg to build a strategy.
          </div>
        )}
        {legs.map((leg) => {
          const row = rowFor(rows, leg.strike, leg.right);
          return (
            <div
              key={leg.key}
              className="grid grid-cols-[88px_64px_1fr_72px_1fr_28px] items-center gap-2 text-sm"
              data-testid="builder-leg-row"
            >
              <select
                className={clsx(
                  "rounded border border-[var(--color-border)] bg-bg px-2 py-1 font-mono outline-none focus:border-green",
                  leg.side === "buy" ? "text-green" : "text-red",
                )}
                value={leg.side}
                onChange={(e) =>
                  patchLeg(leg.key, { side: e.target.value as "buy" | "sell" })
                }
                aria-label="Side"
                data-testid="leg-side"
              >
                <option value="buy">Buy</option>
                <option value="sell">Sell</option>
              </select>

              <input
                className="rounded border border-[var(--color-border)] bg-bg px-2 py-1 text-right font-mono tabular-nums text-text outline-none focus:border-green"
                value={leg.qty}
                inputMode="decimal"
                onChange={(e) => patchLeg(leg.key, { qty: e.target.value })}
                aria-label="Quantity"
                data-testid="leg-qty"
              />

              <select
                className="rounded border border-[var(--color-border)] bg-bg px-2 py-1 font-mono tabular-nums text-text outline-none focus:border-green"
                value={leg.strike ?? ""}
                onChange={(e) =>
                  patchLeg(leg.key, {
                    strike: e.target.value ? Number(e.target.value) : null,
                  })
                }
                aria-label="Strike"
                data-testid="leg-strike"
              >
                <option value="">Strike…</option>
                {strikes.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>

              <select
                className="rounded border border-[var(--color-border)] bg-bg px-2 py-1 font-mono text-text outline-none focus:border-green"
                value={leg.right}
                onChange={(e) =>
                  patchLeg(leg.key, { right: e.target.value as "C" | "P" })
                }
                aria-label="Right"
                data-testid="leg-right"
              >
                <option value="C">Call</option>
                <option value="P">Put</option>
              </select>

              <div className="px-1 text-right font-mono tabular-nums text-neutral">
                mark <span className="text-text">{fmt(row?.mark_price ?? null, 2)}</span>
              </div>

              <button
                className="flex items-center justify-center rounded p-1 text-neutral hover:text-red"
                onClick={() => removeLeg(leg.key)}
                aria-label="Remove leg"
                data-testid="remove-leg"
              >
                <Trash2 size={16} />
              </button>
            </div>
          );
        })}

        <button
          className="mt-1 flex w-fit items-center gap-1 rounded border border-[var(--color-border)] px-2 py-1 text-xs text-neutral hover:border-green hover:text-green"
          onClick={addLeg}
          data-testid="add-leg-btn"
        >
          <Plus size={14} /> Add leg
        </button>
      </div>

      {/* sticky footer: net greeks + payoff + actions */}
      <div className="sticky bottom-0 border-t border-[var(--color-border)] bg-[#0d0d0d] px-3 py-2">
        <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs sm:grid-cols-4">
          <Footer label="Net Δ" testid="net-delta-footer" value={fmtGreek(greeks.delta)} />
          <Footer label="Net Γ" testid="net-gamma-footer" value={fmtGreek(greeks.gamma, 6)} />
          <Footer label="Net Θ" testid="net-theta-footer" value={fmtGreek(greeks.theta)} />
          <Footer label="Net V" testid="net-vega-footer" value={fmtGreek(greeks.vega)} />
          <Footer
            label="Max Profit"
            testid="max-profit-footer"
            value={mpl.maxProfit ? mpl.maxProfit.toFixed(2) : "—"}
            tone={mpl.maxProfit && mpl.maxProfit.isPositive() ? "green" : undefined}
          />
          <Footer
            label="Max Loss"
            testid="max-loss-footer"
            value={mpl.maxLoss ? mpl.maxLoss.toFixed(2) : "—"}
            tone={mpl.maxLoss && mpl.maxLoss.isNegative() ? "red" : undefined}
          />
          <Footer
            label="Breakevens"
            testid="breakevens-footer"
            value={bes.length ? bes.map((b) => b.toFixed(0)).join(", ") : "—"}
          />
          <Footer
            label="Est. slippage"
            testid="slippage-footer"
            value={slippage.isZero() ? "preview" : slippage.toFixed(4)}
          />
        </div>
        <div className="mt-2 flex justify-end">
          <button
            className="rounded bg-green px-4 py-1.5 text-sm font-semibold text-black disabled:cursor-not-allowed disabled:opacity-40"
            onClick={openPreview}
            disabled={!validLegs}
            data-testid="preview-strategy-btn"
          >
            Preview
          </button>
        </div>
      </div>

      {previewSpec && (
        <StrategyPreviewModal
          spec={previewSpec}
          onClose={() => setPreviewSpec(null)}
        />
      )}
    </div>
  );
}

interface FooterProps {
  label: string;
  value: string;
  testid: string;
  tone?: "green" | "red";
}
function Footer({ label, value, testid, tone }: FooterProps): JSX.Element {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-neutral">{label}</span>
      <span
        className={clsx(
          "font-mono tabular-nums",
          tone === "green" && "text-green",
          tone === "red" && "text-red",
          !tone && "text-text",
        )}
        data-testid={testid}
      >
        {value}
      </span>
    </div>
  );
}
