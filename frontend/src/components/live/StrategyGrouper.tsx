import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  createLiveStrategy,
  ConflictError,
  NotConfiguredError,
  type LivePosition,
} from "../../lib/liveApi";
import { toast } from "../../lib/toast";

interface StrategyGrouperProps {
  positions: LivePosition[];
}

/**
 * User-driven strategy tagging (ADR 0004 §4 — NO auto-cluster). Multi-select
 * live positions, name them, POST to tag into a named strategy. A position may
 * belong to at most one strategy: a 409 (already_tagged) is surfaced inline.
 */
export default function StrategyGrouper({
  positions,
}: StrategyGrouperProps): JSX.Element {
  const qc = useQueryClient();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function toggle(symbol: string): void {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(symbol)) next.delete(symbol);
      else next.add(symbol);
      return next;
    });
  }

  const canCreate = name.trim().length > 0 && selected.size > 0 && !busy;

  async function onCreate(): Promise<void> {
    if (!canCreate) return;
    setBusy(true);
    setError(null);
    try {
      const created = await createLiveStrategy(name.trim(), Array.from(selected));
      await qc.invalidateQueries({ queryKey: ["live-strategies"] });
      toast.success(`Strategy #${created.strategy_id} created`);
      setSelected(new Set());
      setName("");
    } catch (e) {
      if (e instanceof ConflictError) {
        setError(
          "One or more selected positions are already in a strategy. Pick untagged positions.",
        );
        toast.error("One or more positions are already in a strategy");
      } else if (e instanceof NotConfiguredError) {
        setError("Live trading not configured — add Delta API keys.");
        toast.error("Live trading not configured — add Delta API keys");
      } else {
        setError(e instanceof Error ? e.message : "Failed to create strategy.");
        toast.error(e instanceof Error ? e.message : "Failed to create strategy");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="flex flex-col gap-3 rounded border border-[var(--color-border)] bg-[var(--color-panel)] p-3"
      data-testid="strategy-grouper"
    >
      <div className="text-xs text-neutral">
        Group positions into a named strategy (whole-strategy stop-loss applies
        to the group)
      </div>

      {error && (
        <div
          className="rounded border border-red bg-red/10 px-3 py-2 text-sm text-red"
          data-testid="grouper-error"
        >
          {error}
        </div>
      )}

      <div className="flex flex-col gap-1">
        {positions.length === 0 ? (
          <div className="py-2 text-center text-xs text-neutral">
            No live positions to group.
          </div>
        ) : (
          positions.map((pos) => (
            <label
              key={pos.symbol}
              className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm hover:bg-[#151515]"
            >
              <input
                type="checkbox"
                checked={selected.has(pos.symbol)}
                onChange={() => toggle(pos.symbol)}
                data-testid="grouper-checkbox"
                data-symbol={pos.symbol}
              />
              <span className="font-mono text-text">{pos.symbol}</span>
              <span className="ml-auto font-mono tabular-nums text-neutral">
                {pos.size}
              </span>
            </label>
          ))
        )}
      </div>

      <div className="flex items-center gap-2">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Strategy name"
          className="flex-1 rounded border border-[var(--color-border)] bg-bg px-2 py-1.5 text-sm text-text placeholder:text-neutral focus:outline-none"
          data-testid="strategy-name-input"
        />
        <button
          className="rounded bg-green px-4 py-1.5 text-sm font-semibold text-black disabled:cursor-not-allowed disabled:opacity-40"
          onClick={() => void onCreate()}
          disabled={!canCreate}
          data-testid="create-strategy-btn"
        >
          {busy ? "Creating…" : "Create strategy"}
        </button>
      </div>
    </div>
  );
}
