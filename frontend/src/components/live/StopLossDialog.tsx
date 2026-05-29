import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";
import {
  setStopLoss,
  clearStopLoss,
  LiveTradingDisabledError,
  NotConfiguredError,
  ConflictError,
  type SlState,
  type StopLossSpec,
} from "../../lib/liveApi";

interface StopLossDialogProps {
  strategyId: number;
  strategyName: string;
  slState: SlState;
  onClose: () => void;
}

type Mode = "abs" | "pct";

/**
 * Arm / disarm a whole-strategy stop-loss (ADR 0004 §5/§9). PARANOID:
 * order-placing, so the confirm button is DISABLED until the user ticks the
 * "I understand this will place real market orders" checkbox; the POST always
 * sends confirm:true. 403/503 are surfaced inline.
 */
export default function StopLossDialog({
  strategyId,
  strategyName,
  slState,
  onClose,
}: StopLossDialogProps): JSX.Element {
  const qc = useQueryClient();
  const [mode, setMode] = useState<Mode>("abs");
  const [thresholdAbs, setThresholdAbs] = useState("");
  const [thresholdPct, setThresholdPct] = useState("");
  const [understood, setUnderstood] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const armed = slState === "ARMED";

  const thresholdValid =
    mode === "abs"
      ? thresholdAbs.trim() !== "" && Number(thresholdAbs) > 0
      : thresholdPct.trim() !== "" && Number(thresholdPct) > 0;

  const canConfirm = understood && thresholdValid && !busy;

  function mapError(e: unknown): string {
    if (e instanceof LiveTradingDisabledError) {
      return "Live trading is disabled — enable live trading to arm a stop-loss.";
    }
    if (e instanceof NotConfiguredError) {
      return "Live trading not configured — add Delta API keys.";
    }
    if (e instanceof ConflictError) {
      return e.message;
    }
    return e instanceof Error ? e.message : "Stop-loss request failed.";
  }

  async function onArm(): Promise<void> {
    if (!canConfirm) return;
    setBusy(true);
    setError(null);
    const spec: StopLossSpec =
      mode === "abs"
        ? { threshold_abs: thresholdAbs.trim(), confirm: true }
        : { threshold_pct: thresholdPct.trim(), confirm: true };
    try {
      await setStopLoss(strategyId, spec);
      await qc.invalidateQueries({ queryKey: ["live-strategies"] });
      onClose();
    } catch (e) {
      setError(mapError(e));
    } finally {
      setBusy(false);
    }
  }

  async function onDisarm(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      await clearStopLoss(strategyId);
      await qc.invalidateQueries({ queryKey: ["live-strategies"] });
      onClose();
    } catch (e) {
      setError(mapError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      role="dialog"
      aria-modal="true"
      data-testid="sl-dialog"
    >
      <div className="w-full max-w-md rounded border border-red/60 bg-[var(--color-panel)] shadow-xl">
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-3">
          <h2 className="text-sm font-semibold text-text">
            Stop-loss · {strategyName}
          </h2>
          <button
            className="text-neutral hover:text-text"
            onClick={onClose}
            aria-label="Close dialog"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex flex-col gap-3 px-4 py-3">
          <div className="rounded border border-red/40 bg-red/10 px-3 py-2 text-xs text-red">
            Real money. Arming a stop-loss authorizes the system to place market
            close orders on your live Delta account when the strategy MTM
            breaches the threshold.
          </div>

          {error && (
            <div
              className="rounded border border-red bg-red/10 px-3 py-2 text-sm text-red"
              data-testid="sl-error"
            >
              {error}
            </div>
          )}

          {/* threshold mode */}
          <div className="flex items-center gap-4 text-sm">
            <label className="flex cursor-pointer items-center gap-1.5">
              <input
                type="radio"
                name="sl-mode"
                checked={mode === "abs"}
                onChange={() => setMode("abs")}
                data-testid="sl-mode-abs"
              />
              <span className="text-text">Absolute loss ($)</span>
            </label>
            <label className="flex cursor-pointer items-center gap-1.5">
              <input
                type="radio"
                name="sl-mode"
                checked={mode === "pct"}
                onChange={() => setMode("pct")}
                data-testid="sl-mode-pct"
              />
              <span className="text-text">% of margin</span>
            </label>
          </div>

          {mode === "abs" ? (
            <input
              type="number"
              min="0"
              step="any"
              value={thresholdAbs}
              onChange={(e) => setThresholdAbs(e.target.value)}
              placeholder="Loss threshold (e.g. 500)"
              className="rounded border border-[var(--color-border)] bg-bg px-2 py-1.5 text-sm text-text placeholder:text-neutral focus:outline-none"
              data-testid="sl-threshold-abs"
            />
          ) : (
            <input
              type="number"
              min="0"
              step="any"
              value={thresholdPct}
              onChange={(e) => setThresholdPct(e.target.value)}
              placeholder="% of margin (e.g. 30)"
              className="rounded border border-[var(--color-border)] bg-bg px-2 py-1.5 text-sm text-text placeholder:text-neutral focus:outline-none"
              data-testid="sl-threshold-pct"
            />
          )}

          <label className="flex cursor-pointer items-start gap-2 text-sm text-text">
            <input
              type="checkbox"
              checked={understood}
              onChange={(e) => setUnderstood(e.target.checked)}
              className="mt-0.5"
              data-testid="sl-understand-checkbox"
            />
            <span>I understand this will place real market orders</span>
          </label>
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-[var(--color-border)] px-4 py-3">
          <div>
            {armed && (
              <button
                className="rounded border border-[var(--color-border)] px-3 py-1.5 text-sm text-neutral hover:text-text disabled:opacity-40"
                onClick={() => void onDisarm()}
                disabled={busy}
                data-testid="disarm-sl-btn"
              >
                Disarm
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              className="rounded border border-[var(--color-border)] px-3 py-1.5 text-sm text-neutral hover:text-text"
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              className="rounded bg-red px-4 py-1.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
              onClick={() => void onArm()}
              disabled={!canConfirm}
              data-testid="sl-confirm-btn"
            >
              {busy ? "Arming…" : "Arm stop-loss"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
