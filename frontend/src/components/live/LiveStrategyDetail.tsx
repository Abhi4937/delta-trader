import { useEffect, useMemo, useRef, useState } from "react";
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
  isStale,
  type LiveStrategy,
  type StrategyAggregate,
} from "../../lib/liveApi";
import { Decimal, fmt, toDecimal } from "../../lib/decimal";
import { useLiveStrategyMtm } from "../../hooks/useLiveData";
import SlBadge from "./SlBadge";
import StopLossDialog from "./StopLossDialog";

interface LiveStrategyDetailProps {
  strategy: LiveStrategy;
}

interface CurvePoint {
  ts: number;
  pnl: number;
}

function pnlTone(d: Decimal | null): string {
  if (d === null || d.isZero()) return "text-text";
  return d.isPositive() ? "text-green" : "text-red";
}

export default function LiveStrategyDetail({
  strategy,
}: LiveStrategyDetailProps): JSX.Element {
  const { data, slState } = useLiveStrategyMtm(strategy.id);
  const [slOpen, setSlOpen] = useState(false);

  // Aggregate snapshot: live MTM query wins, else the list aggregate.
  const aggregate: StrategyAggregate = data?.aggregate ?? strategy.aggregate;

  // Build the live, append-only PnL series. Seed from the history curve, then
  // append one point per second (1Hz) from the polled aggregate.
  const [curve, setCurve] = useState<CurvePoint[]>([]);
  const seededRef = useRef(false);

  useEffect(() => {
    if (seededRef.current) return;
    const hist = data?.curve;
    if (!hist) return;
    seededRef.current = true;
    const pts: CurvePoint[] = hist
      .map((c) => ({
        ts: new Date(c.ts).getTime(),
        pnl: toDecimal(c.total_pnl)?.toNumber() ?? 0,
      }))
      .filter((p) => Number.isFinite(p.ts));
    setCurve(pts);
  }, [data]);

  useEffect(() => {
    const pnl = toDecimal(aggregate.total_pnl);
    if (pnl === null) return;
    setCurve((prev) => {
      const point: CurvePoint = { ts: Date.now(), pnl: pnl.toNumber() };
      const next = [...prev, point];
      return next.length > 1800 ? next.slice(next.length - 1800) : next;
    });
  }, [aggregate.total_pnl]);

  const currentPnl = toDecimal(aggregate.total_pnl);
  const stale = isStale(aggregate.mark_stale);
  const rv = data?.rv;

  return (
    <div
      className="flex flex-col gap-3 rounded border border-[var(--color-border)] bg-[var(--color-panel)] p-3"
      data-testid="live-strategy-detail"
      data-strategy-id={strategy.id}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-text">
          {strategy.name}
          <SlBadge state={slState} />
        </h3>
        <div className="flex items-center gap-3 text-sm">
          <span className={clsx("font-mono tabular-nums", pnlTone(currentPnl))}>
            {currentPnl ? `$${currentPnl.toFixed(2)}` : "—"}
          </span>
          {stale && <span className="text-xs text-red">marks stale</span>}
          <button
            className="rounded border border-red/50 px-2 py-0.5 text-xs text-red hover:bg-red/10"
            onClick={() => setSlOpen(true)}
            data-testid="open-sl-dialog-btn"
          >
            {slState === "ARMED" ? "Manage SL" : "Set stop-loss"}
          </button>
        </div>
      </div>

      <PnlChart curve={curve} />

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <GreeksPanel aggregate={aggregate} />
        <IvPanel aggregate={aggregate} />
        <RvPanel
          intraday={rv?.intraday ?? null}
          historical={rv?.historical ?? null}
          windowMinutes={rv?.window_minutes}
        />
      </div>

      {slOpen && (
        <StopLossDialog
          strategyId={strategy.id}
          strategyName={strategy.name}
          slState={slState}
          onClose={() => setSlOpen(false)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
function PnlChart({ curve }: { curve: CurvePoint[] }): JSX.Element {
  const { min, max } = useMemo(() => {
    let lo = 0;
    let hi = 0;
    for (const p of curve) {
      if (p.pnl < lo) lo = p.pnl;
      if (p.pnl > hi) hi = p.pnl;
    }
    return { min: lo, max: hi };
  }, [curve]);

  const range = max - min;
  const zeroOffset = range === 0 ? 1 : max / range;
  const last = curve[curve.length - 1];
  const clamp = (v: number): number => Math.max(0, Math.min(1, v));

  return (
    <div className="h-56 w-full" data-testid="live-pnl-chart">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart
          data={curve}
          margin={{ top: 8, right: 48, bottom: 4, left: 4 }}
        >
          <defs>
            <linearGradient id="livePnlSplit" x1="0" y1="0" x2="0" y2="1">
              <stop offset={0} stopColor="#10b981" stopOpacity={0.35} />
              <stop offset={clamp(zeroOffset)} stopColor="#10b981" stopOpacity={0.05} />
              <stop offset={clamp(zeroOffset)} stopColor="#ef4444" stopOpacity={0.05} />
              <stop offset={1} stopColor="#ef4444" stopOpacity={0.35} />
            </linearGradient>
            <linearGradient id="livePnlStroke" x1="0" y1="0" x2="0" y2="1">
              <stop offset={0} stopColor="#10b981" />
              <stop offset={clamp(zeroOffset)} stopColor="#10b981" />
              <stop offset={clamp(zeroOffset)} stopColor="#ef4444" />
              <stop offset={1} stopColor="#ef4444" />
            </linearGradient>
          </defs>
          <XAxis
            dataKey="ts"
            type="number"
            domain={["dataMin", "dataMax"]}
            tickFormatter={(v: number) =>
              new Date(v).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })
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
            stroke="url(#livePnlStroke)"
            strokeWidth={1.5}
            fill="url(#livePnlSplit)"
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
function GreeksPanel({
  aggregate,
}: {
  aggregate: StrategyAggregate;
}): JSX.Element {
  return (
    <div
      className="rounded border border-[var(--color-border)] p-2"
      data-testid="live-greeks-panel"
    >
      <div className="mb-1 text-xs text-neutral">Net Greeks</div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
        <Stat label="Δ" value={fmt(aggregate.net_delta, 4)} testid="live-net-delta" />
        <Stat label="Γ" value={fmt(aggregate.net_gamma, 6)} />
        <Stat label="Θ" value={fmt(aggregate.net_theta, 4)} testid="live-net-theta" />
        <Stat label="V" value={fmt(aggregate.net_vega, 4)} />
      </div>
    </div>
  );
}

function IvPanel({
  aggregate,
}: {
  aggregate: StrategyAggregate;
}): JSX.Element {
  const stratIv = toDecimal(aggregate.strategy_iv);
  return (
    <div
      className="rounded border border-[var(--color-border)] p-2"
      data-testid="live-iv-panel"
    >
      <div className="mb-1 text-xs text-neutral">Implied Vol</div>
      <div className="flex items-center justify-between text-xs">
        <span className="text-neutral">Strategy</span>
        <span
          className="font-mono tabular-nums text-text"
          data-testid="live-strategy-iv"
        >
          {stratIv ? `${stratIv.times(100).toFixed(2)}%` : "—"}
        </span>
      </div>
      <div className="mt-2 flex items-center justify-between text-xs">
        <span className="text-neutral">Margin</span>
        <span className="font-mono tabular-nums text-text">
          {fmt(aggregate.margin, 2)}
        </span>
      </div>
    </div>
  );
}

function RvPanel({
  intraday,
  historical,
  windowMinutes,
}: {
  intraday: string | null;
  historical: string | null;
  windowMinutes?: string | number;
}): JSX.Element {
  const intra = toDecimal(intraday);
  const hist = toDecimal(historical);
  return (
    <div
      className="rounded border border-[var(--color-border)] p-2"
      data-testid="live-rv-panel"
    >
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
        intraday {windowMinutes ?? "—"}m windows
      </div>
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
