import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Area,
  ComposedChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import clsx from "clsx";
import {
  getPositionMtm,
  isStale,
  type Mtm,
  type PaperPosition,
} from "../../lib/paperApi";
import { Decimal, fmt, toDecimal } from "../../lib/decimal";
import { parseSymbol } from "../../lib/symbols";
import { usePaperMtm } from "../../hooks/usePaperMtm";
import { useOptionChain } from "../../hooks/useOptionChain";
import type { OptionRow } from "../../lib/api";

interface PaperPositionDetailProps {
  position: PaperPosition;
}

interface CurvePoint {
  ts: number;
  pnl: number;
}

const UNDERLYING = "BTC";

function pnlTone(d: Decimal | null): string {
  if (d === null || d.isZero()) return "text-text";
  return d.isPositive() ? "text-green" : "text-red";
}

export default function PaperPositionDetail({
  position,
}: PaperPositionDetailProps): JSX.Element {
  // greeks/IV panel at 1Hz; the chart samples the same hook.
  const liveMtm = usePaperMtm(
    position.status === "closed" ? null : position.id,
    1,
  );
  const mtm: Mtm | null = liveMtm ?? position.mtm;

  // Initial curve from history + RV/IV context.
  const mtmQuery = useQuery({
    queryKey: ["paper-mtm", position.id],
    queryFn: () => getPositionMtm(position.id, true),
    staleTime: 30_000,
  });

  // Build the live, append-only PnL series. Seed from history curve, then append
  // one point per second (1Hz) from the live MTM hook.
  const [curve, setCurve] = useState<CurvePoint[]>([]);
  const seededRef = useRef(false);

  useEffect(() => {
    if (seededRef.current) return;
    const hist = mtmQuery.data?.curve;
    if (!hist) return;
    seededRef.current = true;
    const pts: CurvePoint[] = hist
      .map((c) => ({
        ts: new Date(c.ts).getTime(),
        pnl: toDecimal(c.total_pnl)?.toNumber() ?? 0,
      }))
      .filter((p) => Number.isFinite(p.ts));
    setCurve(pts);
  }, [mtmQuery.data]);

  useEffect(() => {
    const pnl = toDecimal(mtm?.total_pnl ?? null);
    if (pnl === null) return;
    setCurve((prev) => {
      const point: CurvePoint = { ts: Date.now(), pnl: pnl.toNumber() };
      const next = [...prev, point];
      // cap to a rolling window so memory stays bounded
      return next.length > 1800 ? next.slice(next.length - 1800) : next;
    });
  }, [mtm]);

  const currentPnl = toDecimal(mtm?.total_pnl ?? null);
  const entryCost = toDecimal(position.entry_cost);
  const pctReturn =
    currentPnl && entryCost && !entryCost.isZero()
      ? currentPnl.dividedBy(entryCost.abs()).times(100)
      : null;

  const rv = mtmQuery.data?.rv;
  const stale = isStale(mtm?.mark_stale);

  // per-leg IV from the chain (group leg expiries — load nearest legs' expiry).
  const legExpiry = useMemo(() => {
    const first = position.legs[0];
    if (!first) return null;
    const p = parseSymbol(first.symbol);
    if (!p) return null;
    // wire tail is DDMMYY -> convert to DD-MM-YYYY expiry code
    const t = p.expiry; // e.g. "290526"
    if (t.length !== 6) return null;
    return `${t.slice(0, 2)}-${t.slice(2, 4)}-20${t.slice(4, 6)}`;
  }, [position.legs]);

  const { rows } = useOptionChain(UNDERLYING, legExpiry);

  return (
    <div
      className="flex flex-col gap-3 rounded border border-[var(--color-border)] bg-[var(--color-panel)] p-3"
      data-testid="paper-position-detail"
      data-position-id={position.id}
    >
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-text">
          Position #{position.id} · {position.underlying}
        </h3>
        <div className="flex items-center gap-3 text-sm">
          <span className={clsx("font-mono tabular-nums", pnlTone(currentPnl))}>
            {currentPnl ? `$${currentPnl.toFixed(2)}` : "—"}
          </span>
          {pctReturn && (
            <span className={clsx("font-mono tabular-nums", pnlTone(currentPnl))}>
              {pctReturn.toFixed(2)}%
            </span>
          )}
          {stale && <span className="text-xs text-red">marks stale</span>}
        </div>
      </div>

      {/* live PnL chart */}
      <PnlChart curve={curve} />

      {/* greeks + IV + RV panels */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <GreeksPanel mtm={mtm} />
        <IvPanel mtm={mtm} legs={position.legs} rows={rows} />
        <RvPanel
          intraday={rv?.intraday ?? null}
          historical={rv?.historical ?? null}
          windowMinutes={rv?.window_minutes}
          windowDays={rv?.window_days}
        />
      </div>

      {/* leg breakdown */}
      <LegBreakdown legs={position.legs} rows={rows} />
    </div>
  );
}

// ---------------------------------------------------------------------------
function PnlChart({ curve }: { curve: CurvePoint[] }): JSX.Element {
  // green fill above 0 / red below using a split gradient at the zero offset.
  const { min, max } = useMemo(() => {
    let lo = 0;
    let hi = 0;
    for (const p of curve) {
      if (p.pnl < lo) lo = p.pnl;
      if (p.pnl > hi) hi = p.pnl;
    }
    return { min: lo, max: hi };
  }, [curve]);

  // offset of the zero line within [max..min] domain (0 at top).
  const range = max - min;
  const zeroOffset = range === 0 ? 1 : max / range;
  const last = curve[curve.length - 1];

  return (
    <div className="h-56 w-full" data-testid="paper-pnl-chart">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={curve} margin={{ top: 8, right: 48, bottom: 4, left: 4 }}>
          <defs>
            <linearGradient id="pnlSplit" x1="0" y1="0" x2="0" y2="1">
              <stop offset={0} stopColor="#10b981" stopOpacity={0.35} />
              <stop offset={Math.max(0, Math.min(1, zeroOffset))} stopColor="#10b981" stopOpacity={0.05} />
              <stop offset={Math.max(0, Math.min(1, zeroOffset))} stopColor="#ef4444" stopOpacity={0.05} />
              <stop offset={1} stopColor="#ef4444" stopOpacity={0.35} />
            </linearGradient>
            <linearGradient id="pnlStroke" x1="0" y1="0" x2="0" y2="1">
              <stop offset={0} stopColor="#10b981" />
              <stop offset={Math.max(0, Math.min(1, zeroOffset))} stopColor="#10b981" />
              <stop offset={Math.max(0, Math.min(1, zeroOffset))} stopColor="#ef4444" />
              <stop offset={1} stopColor="#ef4444" />
            </linearGradient>
          </defs>
          <XAxis
            dataKey="ts"
            type="number"
            domain={["dataMin", "dataMax"]}
            tickFormatter={(v: number) =>
              new Date(v).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
            }
            stroke="#737373"
            fontSize={10}
            minTickGap={48}
          />
          <YAxis
            stroke="#737373"
            fontSize={10}
            width={48}
            tickFormatter={(v: number) => v.toFixed(0)}
            domain={["dataMin", "dataMax"]}
          />
          <Tooltip
            contentStyle={{
              background: "#111111",
              border: "1px solid #262626",
              fontSize: 12,
            }}
            labelFormatter={(v) => new Date(Number(v)).toLocaleTimeString()}
            formatter={(v: number) => [`$${v.toFixed(2)}`, "PnL"]}
          />
          <ReferenceLine y={0} stroke="#404040" strokeDasharray="3 3" />
          <Area
            type="monotone"
            dataKey="pnl"
            stroke="url(#pnlStroke)"
            strokeWidth={1.5}
            fill="url(#pnlSplit)"
            isAnimationActive={false}
            dot={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
      {last && (
        <div className="-mt-5 pr-2 text-right text-[11px] font-mono tabular-nums text-neutral">
          now{" "}
          <span className={last.pnl >= 0 ? "text-green" : "text-red"}>
            ${last.pnl.toFixed(2)}
          </span>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
function GreeksPanel({ mtm }: { mtm: Mtm | null }): JSX.Element {
  return (
    <div className="rounded border border-[var(--color-border)] p-2" data-testid="greeks-panel">
      <div className="mb-1 text-xs text-neutral">Net Greeks</div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
        <Stat label="Δ" value={fmt(mtm?.net_delta ?? null, 4)} testid="detail-net-delta" />
        <Stat label="Γ" value={fmt(mtm?.net_gamma ?? null, 6)} />
        <Stat label="Θ" value={fmt(mtm?.net_theta ?? null, 4)} testid="detail-net-theta" />
        <Stat label="V" value={fmt(mtm?.net_vega ?? null, 4)} />
      </div>
    </div>
  );
}

function IvPanel({
  mtm,
  legs,
  rows,
}: {
  mtm: Mtm | null;
  legs: PaperPosition["legs"];
  rows: OptionRow[];
}): JSX.Element {
  const stratIv = toDecimal(mtm?.strategy_iv ?? null);
  return (
    <div className="rounded border border-[var(--color-border)] p-2" data-testid="iv-panel">
      <div className="mb-1 text-xs text-neutral">Implied Vol</div>
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="text-neutral">Strategy</span>
        <span className="font-mono tabular-nums text-text" data-testid="detail-strategy-iv">
          {stratIv ? `${stratIv.times(100).toFixed(2)}%` : "—"}
        </span>
      </div>
      <div className="flex flex-col gap-0.5">
        {legs.map((leg) => {
          const row = rows.find((r) => r.symbol === leg.symbol);
          const iv = toDecimal(row?.iv ?? null);
          return (
            <div key={leg.id} className="flex items-center justify-between text-[11px]">
              <span className="truncate text-neutral">{leg.symbol}</span>
              <span className="font-mono tabular-nums text-text">
                {iv ? `${iv.times(100).toFixed(1)}%` : "—"}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function RvPanel({
  intraday,
  historical,
  windowMinutes,
  windowDays,
}: {
  intraday: string | null;
  historical: string | null;
  windowMinutes?: string | number;
  windowDays?: string | number;
}): JSX.Element {
  const intra = toDecimal(intraday);
  const hist = toDecimal(historical);
  return (
    <div className="rounded border border-[var(--color-border)] p-2" data-testid="rv-panel">
      <div className="mb-1 text-xs text-neutral">Realized Vol (BTC)</div>
      <div className="flex items-center justify-between text-xs">
        <span className="text-neutral">Historical</span>
        <span className="font-mono tabular-nums text-text">
          {hist ? `${hist.times(100).toFixed(2)}%` : "—"}
        </span>
      </div>
      <div className="flex items-center justify-between text-xs">
        <span className="text-neutral">Intraday</span>
        <span className="font-mono tabular-nums text-text">
          {intra ? `${intra.times(100).toFixed(2)}%` : "—"}
        </span>
      </div>
      <div className="mt-1 text-[10px] text-neutral">
        hist {windowDays ?? "—"}d · intraday {windowMinutes ?? "—"}m windows
      </div>
    </div>
  );
}

function LegBreakdown({
  legs,
  rows,
}: {
  legs: PaperPosition["legs"];
  rows: OptionRow[];
}): JSX.Element {
  return (
    <div className="overflow-hidden rounded border border-[var(--color-border)]" data-testid="leg-breakdown">
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-[var(--color-panel)] text-neutral">
            <th className="px-2 py-1 text-left">Leg</th>
            <th className="px-2 py-1 text-right">Side</th>
            <th className="px-2 py-1 text-right">Qty open</th>
            <th className="px-2 py-1 text-right">Entry</th>
            <th className="px-2 py-1 text-right">Mark</th>
            <th className="px-2 py-1 text-right">Exit</th>
            <th className="px-2 py-1 text-center">Status</th>
          </tr>
        </thead>
        <tbody className="font-mono tabular-nums">
          {legs.map((leg) => {
            const row = rows.find((r) => r.symbol === leg.symbol);
            return (
              <tr key={leg.id} className="border-t border-[var(--color-border)]">
                <td className="px-2 py-1 text-left text-text">{leg.symbol}</td>
                <td className={`px-2 py-1 text-right ${leg.side === "buy" ? "text-green" : "text-red"}`}>
                  {leg.side}
                </td>
                <td className="px-2 py-1 text-right text-text">{fmt(leg.qty_open, 2)}</td>
                <td className="px-2 py-1 text-right text-text">{fmt(leg.entry_fill, 2)}</td>
                <td className="px-2 py-1 text-right text-text">{fmt(row?.mark_price ?? null, 2)}</td>
                <td className="px-2 py-1 text-right text-neutral">{fmt(leg.exit_fill, 2)}</td>
                <td className="px-2 py-1 text-center text-neutral">{leg.status}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
function Stat({
  label,
  value,
  testid,
}: {
  label: string;
  value: string;
  testid?: string;
}): JSX.Element {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-neutral">{label}</span>
      <span className="font-mono tabular-nums text-text" data-testid={testid}>
        {value}
      </span>
    </div>
  );
}
