import { useEffect, useRef } from "react";
import {
  createChart,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from "lightweight-charts";
import { toDecimal } from "../lib/decimal";

interface SpotChartProps {
  /** latest spot close as a Decimal-string (or null). */
  close: string | null;
}

export default function SpotChart({ close }: SpotChartProps): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Area"> | null>(null);
  const hasDataRef = useRef(false);

  // Create the chart once.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const chart = createChart(container, {
      width: container.clientWidth,
      height: container.clientHeight || 240,
      layout: {
        background: { color: "#0a0a0a" },
        textColor: "#737373",
      },
      grid: {
        vertLines: { color: "#1a1a1a" },
        horzLines: { color: "#1a1a1a" },
      },
      rightPriceScale: { borderColor: "#262626" },
      timeScale: { borderColor: "#262626", timeVisible: true, secondsVisible: false },
    });
    const series = chart.addAreaSeries({
      lineColor: "#10b981",
      topColor: "rgba(16,185,129,0.30)",
      bottomColor: "rgba(16,185,129,0.0)",
      lineWidth: 2,
    });

    chartRef.current = chart;
    seriesRef.current = series;

    const onResize = (): void => {
      if (containerRef.current) {
        chart.applyOptions({ width: containerRef.current.clientWidth });
      }
    };
    window.addEventListener("resize", onResize);

    return () => {
      window.removeEventListener("resize", onResize);
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
      hasDataRef.current = false;
    };
  }, []);

  // Stream updates via .update() (per skill: never .setData() for streaming).
  useEffect(() => {
    const series = seriesRef.current;
    if (!series) return;
    const d = toDecimal(close);
    if (d === null) return;
    series.update({
      time: (Math.floor(Date.now() / 1000)) as UTCTimestamp,
      value: d.toNumber(),
    });
    hasDataRef.current = true;
  }, [close]);

  return (
    <div className="relative h-60 w-full rounded border border-[var(--color-border)] bg-bg">
      <div ref={containerRef} className="h-full w-full" />
      {close === null && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-neutral">
          Waiting for spot data…
        </div>
      )}
    </div>
  );
}
