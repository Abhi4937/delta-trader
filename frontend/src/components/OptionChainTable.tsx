import React, { useMemo, useRef } from "react";
import clsx from "clsx";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { OptionRow } from "../lib/api";
import { parseSymbol } from "../lib/symbols";
import { fmt, toDecimal } from "../lib/decimal";

interface OptionChainTableProps {
  rows: OptionRow[];
  /** spot price (string) for ATM highlight; null -> highlight middle row */
  spot?: string | null;
  isLoading?: boolean;
}

interface StrikeRow {
  strike: number;
  call: OptionRow | null;
  put: OptionRow | null;
}

const ROW_HEIGHT = 28;

/** delta/greek sign coloring per skill: green +, red -, neutral 0. */
function signClass(v: string | null): string {
  const d = toDecimal(v);
  if (d === null || d.isZero()) return "text-neutral";
  return d.isPositive() ? "text-green" : "text-red";
}

/** Format IV (sigma, e.g. 0.55) as a percentage string. */
function fmtIvPct(v: string | null): string {
  const d = toDecimal(v);
  if (d === null) return "—";
  return `${d.times(100).toFixed(2)}%`;
}

function groupByStrike(rows: OptionRow[]): StrikeRow[] {
  const map = new Map<number, StrikeRow>();
  for (const row of rows) {
    const parsed = parseSymbol(row.symbol);
    if (!parsed) continue;
    let entry = map.get(parsed.strike);
    if (!entry) {
      entry = { strike: parsed.strike, call: null, put: null };
      map.set(parsed.strike, entry);
    }
    if (parsed.side === "C") entry.call = row;
    else entry.put = row;
  }
  return Array.from(map.values()).sort((a, b) => a.strike - b.strike);
}

function findAtmIndex(
  strikes: StrikeRow[],
  spot: string | null | undefined,
): number {
  if (strikes.length === 0) return -1;
  const s = toDecimal(spot ?? null);
  if (s === null) return Math.floor(strikes.length / 2);
  const spotNum = s.toNumber();
  let best = 0;
  let bestDist = Infinity;
  for (let i = 0; i < strikes.length; i++) {
    const dist = Math.abs(strikes[i].strike - spotNum);
    if (dist < bestDist) {
      bestDist = dist;
      best = i;
    }
  }
  return best;
}

interface SideCellsProps {
  row: OptionRow | null;
  side: "call" | "put";
}

const SideCells = React.memo(function SideCells({ row, side }: SideCellsProps) {
  const align = side === "call" ? "justify-end text-right" : "justify-start text-left";
  if (!row) {
    return (
      <>
        <div className={clsx("flex items-center px-2 tabular-nums text-neutral", align)}>—</div>
        <div className={clsx("flex items-center px-2 tabular-nums text-neutral", align)}>—</div>
        <div className={clsx("flex items-center px-2 tabular-nums text-neutral", align)}>—</div>
      </>
    );
  }
  return (
    <>
      <div
        className={clsx("flex items-center px-2 tabular-nums text-text", align)}
        data-testid="iv-cell"
      >
        {fmtIvPct(row.iv)}
      </div>
      <div className={clsx("flex items-center px-2 tabular-nums", align, signClass(row.delta))}>
        {fmt(row.delta, 4)}
      </div>
      <div className={clsx("flex items-center px-2 tabular-nums text-text", align)}>
        {fmt(row.mark_price, 2)}
      </div>
    </>
  );
});

const GRID_COLS = "1fr 1fr 1fr 96px 1fr 1fr 1fr";

interface ChainRowProps {
  item: StrikeRow;
  isAtm: boolean;
}

const ChainRow = React.memo(function ChainRow({ item, isAtm }: ChainRowProps) {
  return (
    <div
      className={clsx(
        "grid items-stretch border-b border-[var(--color-border)] text-xs",
        isAtm && "bg-[#1a1a1a]",
      )}
      style={{ gridTemplateColumns: GRID_COLS, height: ROW_HEIGHT }}
      data-testid="chain-row"
      role="row"
    >
      <SideCells row={item.call} side="call" />
      <div className="flex items-center justify-center bg-[var(--color-panel)] px-3 font-semibold tabular-nums text-text">
        {item.strike}
      </div>
      <SideCells row={item.put} side="put" />
    </div>
  );
});

export default function OptionChainTable({
  rows,
  spot,
  isLoading,
}: OptionChainTableProps): JSX.Element {
  const strikes = useMemo(() => groupByStrike(rows), [rows]);
  const atmIndex = useMemo(() => findAtmIndex(strikes, spot), [strikes, spot]);

  const parentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: strikes.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12,
  });

  if (isLoading && strikes.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center text-neutral">
        Loading option chain…
      </div>
    );
  }

  if (strikes.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center text-neutral">
        No option chain data.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded border border-[var(--color-border)] font-mono">
      <div
        className="grid border-b border-[var(--color-border)] bg-[var(--color-panel)] text-xs text-neutral"
        style={{ gridTemplateColumns: GRID_COLS, height: 28 }}
        role="row"
      >
        <div className="flex items-center justify-end px-2">IV</div>
        <div className="flex items-center justify-end px-2">Delta</div>
        <div className="flex items-center justify-end px-2">Mark</div>
        <div className="flex items-center justify-center px-3 text-text">Strike</div>
        <div className="flex items-center justify-start px-2">Mark</div>
        <div className="flex items-center justify-start px-2">Delta</div>
        <div className="flex items-center justify-start px-2">IV</div>
      </div>
      <div ref={parentRef} className="max-h-[60vh] overflow-auto" role="rowgroup">
        <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
          {virtualizer.getVirtualItems().map((vi) => {
            const item = strikes[vi.index];
            return (
              <div
                key={item.strike}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  transform: `translateY(${vi.start}px)`,
                }}
              >
                <ChainRow item={item} isAtm={vi.index === atmIndex} />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
