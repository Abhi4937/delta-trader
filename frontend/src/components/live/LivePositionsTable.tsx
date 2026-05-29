import React from "react";
import clsx from "clsx";
import type { LivePosition } from "../../lib/liveApi";
import { Decimal, fmt, toDecimal } from "../../lib/decimal";

interface LivePositionsTableProps {
  positions: LivePosition[];
  isLoading?: boolean;
  /** true when GET /live/positions returned 503 (no Delta API keys). */
  notConfigured?: boolean;
}

function pnlClass(d: Decimal | null): string {
  if (d === null || d.isZero()) return "text-text";
  return d.isPositive() ? "text-green" : "text-red";
}

const PositionRow = React.memo(function PositionRow({
  position,
}: {
  position: LivePosition;
}) {
  const size = toDecimal(position.size);
  const unrealized = toDecimal(position.unrealized);
  const long = size?.isPositive() ?? false;

  return (
    <tr
      className="border-t border-[var(--color-border)] hover:bg-[#151515]"
      data-testid="live-position-row"
      data-symbol={position.symbol}
    >
      <td className="px-2 py-1.5 text-left font-mono text-text">
        {position.symbol}
      </td>
      <td
        className={clsx(
          "px-2 py-1.5 text-right font-mono tabular-nums",
          long ? "text-green" : "text-red",
        )}
      >
        {size ? (long ? "+" : "") + size.toFixed(0) : "—"}
      </td>
      <td className="px-2 py-1.5 text-right font-mono tabular-nums text-text">
        {fmt(position.entry_price, 2)}
      </td>
      <td className="px-2 py-1.5 text-right font-mono tabular-nums text-text">
        {fmt(position.mark_price, 2)}
      </td>
      <td
        className={clsx(
          "px-2 py-1.5 text-right font-mono tabular-nums",
          pnlClass(unrealized),
        )}
        data-testid={`live-mtm-${position.symbol}`}
        data-unrealized={position.unrealized}
      >
        {unrealized ? unrealized.toFixed(2) : "—"}
      </td>
      <td className="px-2 py-1.5 text-right font-mono tabular-nums text-text">
        {fmt(position.margin, 2)}
      </td>
    </tr>
  );
});

export default function LivePositionsTable({
  positions,
  isLoading,
  notConfigured,
}: LivePositionsTableProps): JSX.Element {
  if (notConfigured) {
    return (
      <div
        className="rounded border border-yellow-500/40 bg-yellow-500/10 px-4 py-6 text-center text-sm text-yellow-300"
        data-testid="not-configured"
      >
        Live trading not configured (add Delta API keys to .env)
      </div>
    );
  }

  return (
    <div
      className="overflow-hidden rounded border border-[var(--color-border)]"
      data-testid="live-positions-table"
    >
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-[var(--color-panel)] text-xs text-neutral">
            <th className="px-2 py-1.5 text-left">Instrument</th>
            <th className="px-2 py-1.5 text-right">Qty</th>
            <th className="px-2 py-1.5 text-right">Entry</th>
            <th className="px-2 py-1.5 text-right">Mark</th>
            <th className="px-2 py-1.5 text-right">MTM</th>
            <th className="px-2 py-1.5 text-right">Margin</th>
          </tr>
        </thead>
        <tbody>
          {positions.map((pos) => (
            <PositionRow key={pos.symbol} position={pos} />
          ))}
        </tbody>
      </table>
      {positions.length === 0 && (
        <div className="py-6 text-center text-sm text-neutral">
          {isLoading ? "Loading live positions…" : "No live positions."}
        </div>
      )}
    </div>
  );
}
