import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";
import {
  executeStrategy,
  InsufficientDepthError,
  previewStrategy,
  type PreviewResponse,
  type StrategySpec,
} from "../../lib/paperApi";
import { Decimal } from "../../lib/decimal";
import { estimatedSlippageCost, netGreeks, type MathLeg } from "../../lib/strategy-math";
import { toast } from "../../lib/toast";

interface StrategyPreviewModalProps {
  spec: StrategySpec;
  onClose: () => void;
}

type Phase = "loading" | "ready" | "executing" | "executed" | "error";

export default function StrategyPreviewModal({
  spec,
  onClose,
}: StrategyPreviewModalProps): JSX.Element {
  const qc = useQueryClient();
  const [phase, setPhase] = useState<Phase>("loading");
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [insufficient, setInsufficient] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setPhase("loading");
    setError(null);
    setInsufficient(false);
    previewStrategy(spec)
      .then((res) => {
        if (cancelled) return;
        setPreview(res);
        setPhase("ready");
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        if (e instanceof InsufficientDepthError) {
          setInsufficient(true);
          setError(e.message);
        } else {
          setError(e instanceof Error ? e.message : "Preview failed.");
        }
        setPhase("error");
      });
    return () => {
      cancelled = true;
    };
  }, [spec]);

  async function onExecute(): Promise<void> {
    if (!preview) return;
    setPhase("executing");
    setError(null);
    setInsufficient(false);
    try {
      const pos = await executeStrategy({ strategy_id: preview.strategy_id });
      await qc.invalidateQueries({ queryKey: ["paper-positions"] });
      setPhase("executed");
      toast.success(`Position #${pos.id} opened`);
      // brief confirmation then close
      window.setTimeout(onClose, 600);
    } catch (e) {
      if (e instanceof InsufficientDepthError) {
        setInsufficient(true);
        setError(e.message);
        toast.error("Insufficient orderbook depth — order not filled");
      } else {
        setError(e instanceof Error ? e.message : "Execute failed.");
        toast.error(e instanceof Error ? e.message : "Execute failed");
      }
      setPhase("error");
    }
  }

  const p = preview?.preview;

  // Net greeks from the backend preview legs (using the authoritative
  // contract_size, marks unavailable here -> show greeks from builder upstream).
  const greekLegs: MathLeg[] = (p?.legs ?? []).map((l) => ({
    symbol: l.symbol,
    side: l.side,
    qty: new Decimal(l.qty),
    contractSize: new Decimal(l.contract_size),
  }));
  const greeks = netGreeks(greekLegs);
  const slippage = p ? estimatedSlippageCost(p.legs) : new Decimal(0);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      role="dialog"
      aria-modal="true"
      data-testid="strategy-preview-modal"
    >
      <div className="w-full max-w-2xl rounded border border-[var(--color-border)] bg-[var(--color-panel)] shadow-xl">
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-3">
          <h2 className="text-sm font-semibold text-text">
            Preview · {spec.name}
          </h2>
          <button
            className="text-neutral hover:text-text"
            onClick={onClose}
            aria-label="Close preview"
            data-testid="close-preview-btn"
          >
            <X size={18} />
          </button>
        </div>

        <div className="px-4 py-3">
          {phase === "loading" && (
            <div className="py-8 text-center text-sm text-neutral">
              Walking the orderbook…
            </div>
          )}

          {insufficient && (
            <div
              className="mb-3 rounded border border-red bg-red/10 px-3 py-2 text-sm text-red"
              data-testid="insufficient-depth-msg"
            >
              Insufficient orderbook depth — the book cannot fill this size.
              {error ? ` ${error}` : ""}
            </div>
          )}
          {!insufficient && error && (
            <div className="mb-3 rounded border border-red bg-red/10 px-3 py-2 text-sm text-red">
              {error}
            </div>
          )}

          {p && (
            <>
              <table className="mb-3 w-full text-xs">
                <thead>
                  <tr className="text-neutral">
                    <th className="px-2 py-1 text-left">Leg</th>
                    <th className="px-2 py-1 text-right">Side</th>
                    <th className="px-2 py-1 text-right">Qty</th>
                    <th className="px-2 py-1 text-right">VWAP</th>
                    <th className="px-2 py-1 text-right">Impact</th>
                    <th className="px-2 py-1 text-right">Entry fill</th>
                  </tr>
                </thead>
                <tbody className="font-mono tabular-nums">
                  {p.legs.map((l) => (
                    <tr
                      key={l.symbol}
                      className="border-t border-[var(--color-border)]"
                      data-testid="preview-leg-row"
                    >
                      <td className="px-2 py-1 text-left text-text">{l.symbol}</td>
                      <td
                        className={`px-2 py-1 text-right ${
                          l.side === "buy" ? "text-green" : "text-red"
                        }`}
                      >
                        {l.side}
                      </td>
                      <td className="px-2 py-1 text-right text-text">{l.qty}</td>
                      <td className="px-2 py-1 text-right text-text">
                        {new Decimal(l.vwap).toFixed(2)}
                      </td>
                      <td className="px-2 py-1 text-right text-neutral">
                        {new Decimal(l.impact).toFixed(6)}
                      </td>
                      <td className="px-2 py-1 text-right text-text">
                        {new Decimal(l.entry_fill).toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs sm:grid-cols-3">
                <Stat
                  label="Entry cost"
                  testid="strategy-preview-entry-cost"
                  value={new Decimal(p.entry_cost).toFixed(4)}
                />
                <Stat
                  label="Margin est."
                  testid="strategy-preview-margin"
                  value={new Decimal(p.margin_estimate).toFixed(2)}
                />
                <Stat
                  label="Est. slippage"
                  testid="strategy-preview-slippage"
                  value={slippage.toFixed(6)}
                />
                <Stat label="Net Δ" testid="strategy-preview-delta" value={greeks.delta.toFixed(4)} />
                <Stat label="Net Θ" testid="strategy-preview-theta" value={greeks.theta.toFixed(4)} />
                <Stat label="Net V" testid="strategy-preview-vega" value={greeks.vega.toFixed(4)} />
              </div>
            </>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-[var(--color-border)] px-4 py-3">
          {phase === "executed" ? (
            <span className="text-sm text-green" data-testid="execute-success">
              Position opened.
            </span>
          ) : (
            <>
              <button
                className="rounded border border-[var(--color-border)] px-3 py-1.5 text-sm text-neutral hover:text-text"
                onClick={onClose}
              >
                Cancel
              </button>
              <button
                className="rounded bg-green px-4 py-1.5 text-sm font-semibold text-black disabled:cursor-not-allowed disabled:opacity-40"
                onClick={onExecute}
                disabled={phase !== "ready" || !preview}
                data-testid="execute-paper-btn"
              >
                {phase === "executing" ? "Executing…" : "Execute Paper"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

interface StatProps {
  label: string;
  value: string;
  testid: string;
}
function Stat({ label, value, testid }: StatProps): JSX.Element {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-neutral">{label}</span>
      <span className="font-mono tabular-nums text-text" data-testid={testid}>
        {value}
      </span>
    </div>
  );
}
