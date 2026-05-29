import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  getTimeseries,
  TimeseriesNotConfiguredError,
  type TimeseriesSource,
} from "../../lib/timeseriesApi";
import { toDecimal } from "../../lib/decimal";
import type { OptionRow } from "../../lib/api";

interface PositionIVChartProps {
  source: TimeseriesSource;
  /** leg symbols, to render faded per-leg current IV lines. */
  legSymbols?: string[];
  /** current option-chain rows (for per-leg current IV). */
  rows?: OptionRow[];
}

interface IvPoint {
  ts: number;
  iv: number | null;
}

/** IV stored as a decimal fraction on the wire; show as a percentage. */
function ivPct(v: string | null | undefined): number | null {
  const d = toDecimal(v ?? null);
  return d ? d.times(100).toNumber() : null;
}

export default function PositionIVChart({
  source,
  legSymbols = [],
  rows = [],
}: PositionIVChartProps): JSX.Element {
  const query = useQuery({
    queryKey: ["timeseries-iv", source.kind, source.id],
    queryFn: () => getTimeseries(source, ["iv"]),
    staleTime: 15_000,
    retry: false,
  });

  const data: IvPoint[] = useMemo(() => {
    const points = query.data?.points ?? [];
    return points
      .map((p) => ({ ts: new Date(p.ts).getTime(), iv: ivPct(p.iv) }))
      .filter((p) => Number.isFinite(p.ts));
  }, [query.data]);

  // Current per-leg IV (faded reference lines) — best-effort from the chain.
  const legIvs = useMemo(() => {
    const out: { symbol: string; iv: number }[] = [];
    for (const sym of legSymbols) {
      const row = rows.find((r) => r.symbol === sym);
      const iv = ivPct(row?.iv ?? null);
      if (iv !== null) out.push({ symbol: sym, iv });
    }
    return out;
  }, [legSymbols, rows]);

  if (query.error instanceof TimeseriesNotConfiguredError) {
    return (
      <div
        className="flex h-64 w-full items-center justify-center rounded border border-[var(--color-border)] text-sm text-neutral"
        data-testid="iv-chart"
      >
        Live IV history not available — Delta API keys not configured.
      </div>
    );
  }

  return (
    <div
      className="h-64 w-full rounded border border-[var(--color-border)] bg-bg p-2"
      data-testid="iv-chart"
    >
      {data.length === 0 ? (
        <div className="flex h-full items-center justify-center text-sm text-neutral">
          {query.isLoading ? "Loading IV…" : "No IV history yet"}
        </div>
      ) : (
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 16, bottom: 4, left: 4 }}>
            <CartesianGrid stroke="#1a1a1a" />
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
              tickFormatter={(v: number) => `${v.toFixed(0)}%`}
            />
            <Tooltip
              contentStyle={{
                background: "#111111",
                border: "1px solid #262626",
                fontSize: 12,
              }}
              labelFormatter={(v) => new Date(Number(v)).toLocaleTimeString()}
              formatter={(v: number) => [`${v.toFixed(2)}%`, "Strategy IV"]}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            {/* faded per-leg current IV reference lines */}
            {legIvs.map((leg) => (
              <ReferenceLine
                key={leg.symbol}
                y={leg.iv}
                stroke="#404040"
                strokeDasharray="2 3"
                strokeOpacity={0.6}
              />
            ))}
            <Line
              type="monotone"
              dataKey="iv"
              name="Strategy IV"
              stroke="#eab308"
              strokeWidth={1.75}
              dot={false}
              isAnimationActive={false}
              connectNulls
            />
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
