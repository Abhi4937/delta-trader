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

interface RvData {
  intraday: string | null;
  historical: string | null;
  windowMinutes?: string | number;
  windowDays?: string | number;
}

interface RVPanelProps {
  source: TimeseriesSource;
  /** RV snapshot from the /mtm endpoint (intraday + historical). */
  rv: RvData | null;
}

function pct(v: string | null | undefined): string {
  const d = toDecimal(v ?? null);
  return d ? `${d.times(100).toFixed(2)}%` : "—";
}

/** Convert a window-minutes value to an hour label (60 -> "1h"). */
function minutesToLabel(m: string | number | undefined): string | null {
  const n = Number(m);
  if (!Number.isFinite(n) || n <= 0) return null;
  const hours = n / 60;
  if (hours < 1) return `${n}m`;
  if (hours < 24) return `${hours}h`;
  return `${hours / 24}d`;
}

function rvPct(v: string | null | undefined): number | null {
  const d = toDecimal(v ?? null);
  return d ? d.times(100).toNumber() : null;
}

export default function RVPanel({ source, rv }: RVPanelProps): JSX.Element {
  // The intraday window from /mtm tells us which card the intraday value fills.
  const intradayLabel = minutesToLabel(rv?.windowMinutes) ?? "1h";
  const histLabel = rv?.windowDays ? `${rv.windowDays}d` : "30d";

  // Cards keyed by window; fill the ones we actually have data for, "—" else.
  const cards: { window: string; value: string }[] = useMemo(() => {
    const map = new Map<string, string>([
      ["1h", "—"],
      ["4h", "—"],
      ["1d", "—"],
      ["30d", "—"],
    ]);
    if (rv?.intraday != null && map.has(intradayLabel)) {
      map.set(intradayLabel, pct(rv.intraday));
    }
    if (rv?.historical != null && map.has(histLabel)) {
      map.set(histLabel, pct(rv.historical));
    } else if (rv?.historical != null) {
      // historical window not one of the standard cards — still surface in 30d.
      map.set("30d", pct(rv.historical));
    }
    return Array.from(map, ([window, value]) => ({ window, value }));
  }, [rv, intradayLabel, histLabel]);

  // IV vs RV over the position life.
  const query = useQuery({
    queryKey: ["timeseries-ivrv", source.kind, source.id],
    queryFn: () =>
      getTimeseries(source, ["iv", "rv_intraday", "rv_historical"]),
    staleTime: 15_000,
    retry: false,
  });

  const series: Array<{ ts: number; iv: number | null; rv: number | null }> =
    useMemo(() => {
      const points = query.data?.points ?? [];
      return points
        .map((p) => ({
          ts: new Date(p.ts).getTime(),
          iv: rvPct(p.iv),
          // prefer intraday RV, fall back to historical when intraday is null.
          rv: rvPct(p.rv_intraday) ?? rvPct(p.rv_historical),
        }))
        .filter((p) => Number.isFinite(p.ts));
    }, [query.data]);

  const notConfigured = query.error instanceof TimeseriesNotConfiguredError;

  return (
    <div className="flex flex-col gap-2" data-testid="rv-panel">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {cards.map((c) => (
          <div
            key={c.window}
            className="rounded border border-[var(--color-border)] bg-bg p-2"
            data-testid="rv-card"
            data-window={c.window}
          >
            <div className="text-[11px] uppercase tracking-wide text-neutral">
              RV {c.window}
            </div>
            <div className="font-mono tabular-nums text-sm text-text">
              {c.value}
            </div>
          </div>
        ))}
      </div>

      <div className="h-56 w-full rounded border border-[var(--color-border)] bg-bg p-2">
        {notConfigured ? (
          <div className="flex h-full items-center justify-center text-sm text-neutral">
            IV/RV history not available — Delta API keys not configured.
          </div>
        ) : series.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-neutral">
            {query.isLoading ? "Loading IV/RV…" : "No IV/RV history yet"}
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={series}
              margin={{ top: 8, right: 16, bottom: 4, left: 4 }}
            >
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
                formatter={(v: number, name: string) => [
                  `${v.toFixed(2)}%`,
                  name,
                ]}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Line
                type="monotone"
                dataKey="iv"
                name="IV"
                stroke="#eab308"
                strokeWidth={1.5}
                dot={false}
                isAnimationActive={false}
                connectNulls
              />
              <Line
                type="monotone"
                dataKey="rv"
                name="RV"
                stroke="#22d3ee"
                strokeWidth={1.5}
                dot={false}
                isAnimationActive={false}
                connectNulls
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
