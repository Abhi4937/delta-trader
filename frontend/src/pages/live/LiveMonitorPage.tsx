import { useMemo, useState } from "react";
import clsx from "clsx";
import LivePositionsTable from "../../components/live/LivePositionsTable";
import StrategyGrouper from "../../components/live/StrategyGrouper";
import LiveStrategyDetail from "../../components/live/LiveStrategyDetail";
import SlBadge from "../../components/live/SlBadge";
import { useLivePositions, useLiveStrategies } from "../../hooks/useLiveData";
import { Decimal, toDecimal } from "../../lib/decimal";
import type { LiveStrategy } from "../../lib/liveApi";

function pnlClass(d: Decimal | null): string {
  if (d === null || d.isZero()) return "text-text";
  return d.isPositive() ? "text-green" : "text-red";
}

export default function LiveMonitorPage(): JSX.Element {
  const { positions, isLoading, notConfigured } = useLivePositions();
  const { strategies } = useLiveStrategies();
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const selected = useMemo(
    () => strategies.find((s) => s.id === selectedId) ?? null,
    [strategies, selectedId],
  );

  return (
    <div className="flex flex-col gap-4" data-testid="live-monitor-page">
      {/* PROMINENT REAL-MONEY MARKER */}
      <div
        className="flex items-center gap-2 rounded border border-red bg-red/15 px-3 py-2 text-sm font-semibold uppercase tracking-wide text-red"
        data-testid="live-banner"
        role="alert"
      >
        <span className="animate-pulse text-base leading-none">●</span>
        LIVE — REAL MONEY
        <span className="ml-2 hidden text-xs font-normal normal-case text-red/80 sm:inline">
          Positions and stop-loss actions affect your live Delta account.
        </span>
      </div>

      <section>
        <div className="mb-2 text-xs text-neutral">Live Positions</div>
        <LivePositionsTable
          positions={positions}
          isLoading={isLoading}
          notConfigured={notConfigured}
        />
      </section>

      {!notConfigured && (
        <>
          <section>
            <StrategyGrouper positions={positions} />
          </section>

          <section>
            <div className="mb-2 text-xs text-neutral">Strategies</div>
            <StrategiesTable
              strategies={strategies}
              selectedId={selectedId}
              onSelect={setSelectedId}
            />
          </section>

          {selected && (
            <section>
              <LiveStrategyDetail strategy={selected} />
            </section>
          )}
        </>
      )}
    </div>
  );
}

function StrategiesTable({
  strategies,
  selectedId,
  onSelect,
}: {
  strategies: LiveStrategy[];
  selectedId: number | null;
  onSelect: (id: number) => void;
}): JSX.Element {
  return (
    <div
      className="overflow-hidden rounded border border-[var(--color-border)]"
      data-testid="live-strategies-table"
    >
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-[var(--color-panel)] text-xs text-neutral">
            <th className="px-2 py-1.5 text-left">Strategy</th>
            <th className="px-2 py-1.5 text-left">Legs</th>
            <th className="px-2 py-1.5 text-right">PnL</th>
            <th className="px-2 py-1.5 text-right">Net Δ</th>
            <th className="px-2 py-1.5 text-center">Stop-loss</th>
          </tr>
        </thead>
        <tbody>
          {strategies.map((s) => {
            const pnl = toDecimal(s.aggregate.total_pnl);
            const delta = toDecimal(s.aggregate.net_delta);
            return (
              <tr
                key={s.id}
                className={clsx(
                  "cursor-pointer border-t border-[var(--color-border)] hover:bg-[#151515]",
                  s.id === selectedId && "bg-[#1a1a1a]",
                )}
                onClick={() => onSelect(s.id)}
                data-testid="live-strategy-row"
                data-strategy-id={s.id}
              >
                <td className="px-2 py-1.5 text-left text-text">{s.name}</td>
                <td className="px-2 py-1.5 text-left text-neutral">
                  {s.symbols.length} leg{s.symbols.length === 1 ? "" : "s"}
                </td>
                <td
                  className={clsx(
                    "px-2 py-1.5 text-right font-mono tabular-nums",
                    pnlClass(pnl),
                  )}
                >
                  {pnl ? pnl.toFixed(2) : "—"}
                </td>
                <td className="px-2 py-1.5 text-right font-mono tabular-nums text-text">
                  {delta ? delta.toFixed(4) : "—"}
                </td>
                <td className="px-2 py-1.5 text-center">
                  <SlBadge state={s.sl_state} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {strategies.length === 0 && (
        <div className="py-6 text-center text-sm text-neutral">
          No strategies yet — group positions above to create one.
        </div>
      )}
    </div>
  );
}
