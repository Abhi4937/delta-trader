import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
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

interface PositionGreeksChartProps {
  source: TimeseriesSource;
}

interface GreekPoint {
  ts: number;
  delta: number | null;
  gamma: number | null;
  theta: number | null;
  vega: number | null;
}

const SERIES = [
  { key: "delta", label: "Δ delta", color: "#3b82f6" },
  { key: "gamma", label: "Γ gamma", color: "#a855f7" },
  { key: "theta", label: "Θ theta", color: "#f59e0b" },
  { key: "vega", label: "V vega", color: "#10b981" },
] as const;

function num(v: string | null | undefined): number | null {
  return toDecimal(v ?? null)?.toNumber() ?? null;
}

export default function PositionGreeksChart({
  source,
}: PositionGreeksChartProps): JSX.Element {
  const query = useQuery({
    queryKey: ["timeseries-greeks", source.kind, source.id],
    queryFn: () =>
      getTimeseries(source, ["delta", "gamma", "theta", "vega"]),
    staleTime: 15_000,
    retry: false,
  });

  const data: GreekPoint[] = useMemo(() => {
    const points = query.data?.points ?? [];
    return points
      .map((p) => ({
        ts: new Date(p.ts).getTime(),
        delta: num(p.delta),
        gamma: num(p.gamma),
        theta: num(p.theta),
        vega: num(p.vega),
      }))
      .filter((p) => Number.isFinite(p.ts));
  }, [query.data]);

  if (query.error instanceof TimeseriesNotConfiguredError) {
    return (
      <div
        className="flex h-72 w-full items-center justify-center rounded border border-[var(--color-border)] text-sm text-neutral"
        data-testid="greeks-chart"
      >
        Live Greeks history not available — Delta API keys not configured.
      </div>
    );
  }

  return (
    <div
      className="h-72 w-full rounded border border-[var(--color-border)] bg-bg p-2"
      data-testid="greeks-chart"
    >
      {data.length === 0 ? (
        <div className="flex h-full items-center justify-center text-sm text-neutral">
          {query.isLoading ? "Loading Greeks…" : "No Greeks history yet"}
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
            <YAxis stroke="#737373" fontSize={10} width={56} />
            <Tooltip
              contentStyle={{
                background: "#111111",
                border: "1px solid #262626",
                fontSize: 12,
              }}
              labelFormatter={(v) => new Date(Number(v)).toLocaleTimeString()}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            {SERIES.map((s) => (
              <Line
                key={s.key}
                type="monotone"
                dataKey={s.key}
                name={s.label}
                stroke={s.color}
                strokeWidth={1.5}
                dot={false}
                isAnimationActive={false}
                connectNulls
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
