import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";
import {
  closePosition,
  InsufficientDepthError,
  type PaperPosition,
} from "../../lib/paperApi";
import { Decimal, fmt, toDecimal } from "../../lib/decimal";
import { useOptionChain } from "../../hooks/useOptionChain";
import { parseSymbol } from "../../lib/symbols";
import { toast } from "../../lib/toast";

interface ClosePositionDialogProps {
  position: PaperPosition;
  onClose: () => void;
}

type Phase = "confirm" | "closing" | "closed" | "error";

const UNDERLYING = "BTC";

function legExpiryCode(position: PaperPosition): string | null {
  const first = position.legs[0];
  if (!first) return null;
  const p = parseSymbol(first.symbol);
  if (!p || p.expiry.length !== 6) return null;
  const t = p.expiry;
  return `${t.slice(0, 2)}-${t.slice(2, 4)}-20${t.slice(4, 6)}`;
}

export default function ClosePositionDialog({
  position,
  onClose,
}: ClosePositionDialogProps): JSX.Element {
  const qc = useQueryClient();
  const [phase, setPhase] = useState<Phase>("confirm");
  const [error, setError] = useState<string | null>(null);
  const [insufficient, setInsufficient] = useState(false);
  const [realized, setRealized] = useState<string | null>(null);

  const { rows } = useOptionChain(UNDERLYING, legExpiryCode(position));

  const openLegs = position.legs.filter(
    (l) => toDecimal(l.qty_open)?.greaterThan(0) ?? false,
  );

  async function onConfirm(): Promise<void> {
    setPhase("closing");
    setError(null);
    setInsufficient(false);
    try {
      // Full close: omit legs body.
      const res = await closePosition(position.id);
      await qc.invalidateQueries({ queryKey: ["paper-positions"] });
      await qc.invalidateQueries({ queryKey: ["paper-mtm", position.id] });
      setRealized(res.close.realized_pnl);
      setPhase("closed");
      const pnl = toDecimal(res.close.realized_pnl);
      toast.success(
        `Position #${position.id} closed · realized PnL $${pnl ? pnl.toFixed(2) : res.close.realized_pnl}`,
      );
    } catch (e) {
      if (e instanceof InsufficientDepthError) {
        setInsufficient(true);
        setError(e.message);
        toast.error("Insufficient depth to close — try again shortly");
      } else {
        setError(e instanceof Error ? e.message : "Close failed.");
        toast.error(e instanceof Error ? e.message : "Close failed");
      }
      setPhase("error");
    }
  }

  const realizedD = toDecimal(realized);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      role="dialog"
      aria-modal="true"
      data-testid="close-position-dialog"
    >
      <div className="w-full max-w-lg rounded border border-[var(--color-border)] bg-[var(--color-panel)] shadow-xl">
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-3">
          <h2 className="text-sm font-semibold text-text">
            Close position #{position.id}
          </h2>
          <button
            className="text-neutral hover:text-text"
            onClick={onClose}
            aria-label="Close dialog"
          >
            <X size={18} />
          </button>
        </div>

        <div className="px-4 py-3">
          {insufficient && (
            <div className="mb-3 rounded border border-red bg-red/10 px-3 py-2 text-sm text-red">
              Insufficient orderbook depth to close at this size — try again shortly.
            </div>
          )}
          {!insufficient && error && (
            <div className="mb-3 rounded border border-red bg-red/10 px-3 py-2 text-sm text-red">
              {error}
            </div>
          )}

          {phase === "closed" ? (
            <div className="py-4 text-center">
              <div className="text-sm text-neutral">Position closed.</div>
              <div
                className={`mt-1 font-mono text-lg tabular-nums ${
                  realizedD && realizedD.isPositive()
                    ? "text-green"
                    : realizedD && realizedD.isNegative()
                      ? "text-red"
                      : "text-text"
                }`}
                data-testid="close-realized-pnl"
              >
                Realized PnL: {realizedD ? `$${realizedD.toFixed(2)}` : "—"}
              </div>
            </div>
          ) : (
            <>
              <p className="mb-2 text-xs text-neutral">
                Full close — every open leg reverse-walks the book at current
                marks. Estimated exit is the current mark; the actual fill
                includes slippage.
              </p>
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-neutral">
                    <th className="px-2 py-1 text-left">Leg</th>
                    <th className="px-2 py-1 text-right">Qty open</th>
                    <th className="px-2 py-1 text-right">Entry</th>
                    <th className="px-2 py-1 text-right">Est. exit (mark)</th>
                  </tr>
                </thead>
                <tbody className="font-mono tabular-nums">
                  {openLegs.map((leg) => {
                    const row = rows.find((r) => r.symbol === leg.symbol);
                    return (
                      <tr key={leg.id} className="border-t border-[var(--color-border)]">
                        <td className="px-2 py-1 text-left text-text">{leg.symbol}</td>
                        <td className="px-2 py-1 text-right text-text">{fmt(leg.qty_open, 2)}</td>
                        <td className="px-2 py-1 text-right text-text">{fmt(leg.entry_fill, 2)}</td>
                        <td className="px-2 py-1 text-right text-text">
                          {fmt(row?.mark_price ?? null, 2)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div className="mt-2 flex items-center justify-between text-xs">
                <span className="text-neutral">Current MTM</span>
                <span className="font-mono tabular-nums text-text">
                  {position.mtm ? `$${new Decimal(position.mtm.total_pnl).toFixed(2)}` : "—"}
                </span>
              </div>
            </>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-[var(--color-border)] px-4 py-3">
          {phase === "closed" ? (
            <button
              className="rounded bg-green px-4 py-1.5 text-sm font-semibold text-black"
              onClick={onClose}
            >
              Done
            </button>
          ) : (
            <>
              <button
                className="rounded border border-[var(--color-border)] px-3 py-1.5 text-sm text-neutral hover:text-text"
                onClick={onClose}
              >
                Cancel
              </button>
              <button
                className="rounded bg-red px-4 py-1.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
                onClick={onConfirm}
                disabled={phase === "closing"}
                data-testid="confirm-close-btn"
              >
                {phase === "closing" ? "Closing…" : "Confirm Close"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
