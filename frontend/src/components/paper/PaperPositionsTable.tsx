import React from "react";
import clsx from "clsx";
import type { PaperPosition } from "../../lib/paperApi";
import { isStale } from "../../lib/paperApi";
import { Decimal, toDecimal } from "../../lib/decimal";
import { usePaperMtm } from "../../hooks/usePaperMtm";
import Skeleton from "../Skeleton";
import EmptyState from "../EmptyState";

interface PaperPositionsTableProps {
  positions: PaperPosition[];
  selectedId: number | null;
  onSelect: (id: number) => void;
  onClose: (position: PaperPosition) => void;
  isLoading?: boolean;
}

function pnlClass(d: Decimal | null): string {
  if (d === null || d.isZero()) return "text-text";
  return d.isPositive() ? "text-green" : "text-red";
}

interface RowProps {
  position: PaperPosition;
  selected: boolean;
  onSelect: (id: number) => void;
  onClose: (position: PaperPosition) => void;
}

const PositionRow = React.memo(function PositionRow({
  position,
  selected,
  onSelect,
  onClose,
}: RowProps) {
  // Live MTM number throttled to 4Hz (per the throttling skill).
  const live = usePaperMtm(position.status === "closed" ? null : position.id, 4);
  const mtm = live ?? position.mtm;

  const totalPnl = toDecimal(mtm?.total_pnl ?? null);
  const entryCost = toDecimal(position.entry_cost);
  const pctReturn =
    totalPnl && entryCost && !entryCost.isZero()
      ? totalPnl.dividedBy(entryCost.abs()).times(100)
      : null;
  const netDelta = toDecimal(mtm?.net_delta ?? null);
  const stale = isStale(mtm?.mark_stale);

  return (
    <tr
      className={clsx(
        "cursor-pointer border-t border-[var(--color-border)] hover:bg-[#151515]",
        selected && "bg-[#1a1a1a]",
      )}
      onClick={() => onSelect(position.id)}
      data-testid="paper-position-row"
      data-position-id={position.id}
    >
      <td className="px-2 py-1.5 text-left font-mono text-text">#{position.id}</td>
      <td className="px-2 py-1.5 text-left text-neutral">
        {position.legs.length} leg{position.legs.length === 1 ? "" : "s"}
      </td>
      <td
        className={clsx("px-2 py-1.5 text-right font-mono tabular-nums", pnlClass(totalPnl))}
        data-testid={`paper-mtm-${position.id}`}
        data-total-pnl={mtm?.total_pnl ?? ""}
        data-mtm-ts={mtm?.ts ?? ""}
      >
        {totalPnl ? totalPnl.toFixed(2) : "—"}
        {stale && <span className="ml-1 text-[10px] text-red">stale</span>}
      </td>
      <td className={clsx("px-2 py-1.5 text-right font-mono tabular-nums", pnlClass(totalPnl))}>
        {pctReturn ? `${pctReturn.toFixed(2)}%` : "—"}
      </td>
      <td className="px-2 py-1.5 text-right font-mono tabular-nums text-text">
        {netDelta ? netDelta.toFixed(4) : "—"}
      </td>
      <td className="px-2 py-1.5 text-center">
        <span
          className={clsx(
            "rounded px-1.5 py-0.5 text-[10px] uppercase",
            position.status === "open" && "bg-green/15 text-green",
            position.status === "partially_closed" && "bg-yellow-500/15 text-yellow-400",
            position.status === "closed" && "bg-neutral/15 text-neutral",
          )}
        >
          {position.status === "partially_closed" ? "partial" : position.status}
        </span>
      </td>
      <td className="px-2 py-1.5 text-right">
        {position.status !== "closed" ? (
          <button
            className="rounded border border-red/50 px-2 py-0.5 text-xs text-red hover:bg-red/10"
            onClick={(e) => {
              e.stopPropagation();
              onClose(position);
            }}
            data-testid="close-position-btn"
            data-position-id={position.id}
          >
            Close
          </button>
        ) : (
          <span className="text-xs text-neutral">closed</span>
        )}
      </td>
    </tr>
  );
});

export default function PaperPositionsTable({
  positions,
  selectedId,
  onSelect,
  onClose,
  isLoading,
}: PaperPositionsTableProps): JSX.Element {
  // Initial load: pulsing skeleton while we have no rows yet.
  if (isLoading && positions.length === 0) {
    return (
      <div
        className="overflow-hidden rounded border border-[var(--color-border)]"
        data-testid="paper-positions-table"
      >
        <Skeleton rows={4} />
      </div>
    );
  }

  return (
    <div
      className="overflow-hidden rounded border border-[var(--color-border)]"
      data-testid="paper-positions-table"
    >
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-[var(--color-panel)] text-xs text-neutral">
            <th className="px-2 py-1.5 text-left">Pos</th>
            <th className="px-2 py-1.5 text-left">Legs</th>
            <th className="px-2 py-1.5 text-right">PnL</th>
            <th className="px-2 py-1.5 text-right">Return</th>
            <th className="px-2 py-1.5 text-right">Net Δ</th>
            <th className="px-2 py-1.5 text-center">Status</th>
            <th className="px-2 py-1.5 text-right">Action</th>
          </tr>
        </thead>
        <tbody>
          {positions.map((pos) => (
            <PositionRow
              key={pos.id}
              position={pos}
              selected={pos.id === selectedId}
              onSelect={onSelect}
              onClose={onClose}
            />
          ))}
        </tbody>
      </table>
      {positions.length === 0 && (
        <EmptyState
          title="No paper positions yet — build a strategy"
          hint="Use the strategy builder above, then Preview and Execute."
        />
      )}
    </div>
  );
}
