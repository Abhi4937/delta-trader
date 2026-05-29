import { useMemo } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import {
  CartesianGrid,
  Line,
  ComposedChart,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { getExpiries, getOptionChain, type OptionRow } from "../../lib/api";
import { toDecimal } from "../../lib/decimal";

interface VolConeMiniProps {
  underlying: string;
  /** current RV (decimal fraction) overlaid as a horizontal line. */
  currentRv: string | null;
  /** how many nearest expiries to fetch (multi-expiry can be heavy). */
  maxExpiries?: number;
}

interface ConePoint {
  /** days to expiry */
  dte: number;
  expiry: string;
  iv: number; // percent
}

/**
 * ATM IV for a chain = IV of the option whose |delta| is closest to 0.5. Falls
 * back to the median IV across the chain if deltas are missing.
 */
function atmIv(rows: OptionRow[]): number | null {
  let best: { dist: number; iv: number } | null = null;
  const ivs: number[] = [];
  for (const r of rows) {
    const iv = toDecimal(r.iv)?.toNumber();
    if (iv === undefined || !Number.isFinite(iv) || iv <= 0) continue;
    ivs.push(iv);
    const delta = toDecimal(r.delta)?.toNumber();
    if (delta === undefined || !Number.isFinite(delta)) continue;
    const dist = Math.abs(Math.abs(delta) - 0.5);
    if (best === null || dist < best.dist) best = { dist, iv };
  }
  if (best) return best.iv * 100;
  if (ivs.length) {
    ivs.sort((a, b) => a - b);
    return ivs[Math.floor(ivs.length / 2)] * 100;
  }
  return null;
}

function dteFromExpiry(expiryTs: string): number {
  const ms = new Date(expiryTs).getTime() - Date.now();
  return Math.max(0, ms / 86_400_000);
}

export default function VolConeMini({
  underlying,
  currentRv,
  maxExpiries = 5,
}: VolConeMiniProps): JSX.Element {
  const expiriesQuery = useQuery({
    queryKey: ["expiries", underlying],
    queryFn: async () => (await getExpiries(underlying)).expiries,
    staleTime: 5 * 60 * 1000,
  });

  const expiries = useMemo(
    () => (expiriesQuery.data ?? []).slice(0, maxExpiries),
    [expiriesQuery.data, maxExpiries],
  );

  // Fetch each expiry's chain in parallel (bounded to maxExpiries).
  const chainQueries = useQueries({
    queries: expiries.map((e) => ({
      queryKey: ["option-chain", underlying, e.expiry_code],
      queryFn: () => getOptionChain(underlying, e.expiry_code),
      staleTime: 60_000,
      retry: false,
    })),
  });

  const points: ConePoint[] = useMemo(() => {
    const out: ConePoint[] = [];
    expiries.forEach((e, i) => {
      const rows = chainQueries[i]?.data?.rows ?? [];
      const iv = atmIv(rows);
      if (iv === null) return;
      out.push({
        dte: Number(dteFromExpiry(e.expiry_ts).toFixed(2)),
        expiry: e.expiry_code,
        iv,
      });
    });
    return out.sort((a, b) => a.dte - b.dte);
  }, [expiries, chainQueries]);

  const rvPct = useMemo(() => {
    const d = toDecimal(currentRv);
    return d ? d.times(100).toNumber() : null;
  }, [currentRv]);

  const loading =
    expiriesQuery.isLoading || chainQueries.some((q) => q.isLoading);

  return (
    <div
      className="h-56 w-full rounded border border-[var(--color-border)] bg-bg p-2"
      data-testid="vol-cone"
    >
      <div className="mb-1 text-[11px] text-neutral">
        ATM IV by expiry (vol cone){" "}
        {rvPct !== null && (
          <span className="text-[var(--color-accent,#22d3ee)]">
            · RV {rvPct.toFixed(1)}%
          </span>
        )}
      </div>
      {points.length === 0 ? (
        <div className="flex h-full items-center justify-center text-sm text-neutral">
          {loading ? "Loading vol cone…" : "No IV data across expiries"}
        </div>
      ) : (
        <ResponsiveContainer width="100%" height="90%">
          <ComposedChart
            data={points}
            margin={{ top: 8, right: 16, bottom: 16, left: 4 }}
          >
            <CartesianGrid stroke="#1a1a1a" />
            <XAxis
              dataKey="dte"
              type="number"
              domain={["dataMin", "dataMax"]}
              tickFormatter={(v: number) => `${v.toFixed(0)}d`}
              stroke="#737373"
              fontSize={10}
              label={{
                value: "days to expiry",
                position: "insideBottom",
                offset: -6,
                fill: "#737373",
                fontSize: 10,
              }}
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
              formatter={(v: number) => [`${v.toFixed(2)}%`, "ATM IV"]}
              labelFormatter={(v) => `${Number(v).toFixed(1)}d`}
            />
            {rvPct !== null && (
              <ReferenceLine
                y={rvPct}
                stroke="#22d3ee"
                strokeDasharray="4 3"
                label={{
                  value: "RV",
                  fill: "#22d3ee",
                  fontSize: 10,
                  position: "right",
                }}
              />
            )}
            <Line
              type="monotone"
              dataKey="iv"
              stroke="#eab308"
              strokeWidth={1.5}
              dot={false}
              isAnimationActive={false}
            />
            <Scatter dataKey="iv" fill="#eab308" />
          </ComposedChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
