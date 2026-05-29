import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  createChart,
  type IChartApi,
  type ISeriesApi,
  type LineData,
  type UTCTimestamp,
  type CandlestickData,
} from "lightweight-charts";
import { getCandles, type RawCandle } from "../lib/api";
import { toDecimal } from "../lib/decimal";
import { useSpotCandles } from "../hooks/useSpotCandles";
import IndicatorPanel, {
  defaultIndicatorConfig,
  type IndicatorConfig,
} from "./indicators/IndicatorPanel";
import {
  adx,
  atr,
  bbands,
  ema,
  macd,
  rsi,
  type Bar,
} from "../lib/indicators";

// Cap chart history to a rolling window so memory & per-tick recompute stay
// bounded (ADR 0005 §1 + perf gate). 6h of 1m bars = 360.
const MAX_BARS = 360;
const HISTORY_SECONDS = 6 * 3600;

const CHART_BG = "#0a0a0a";
const GRID = "#1a1a1a";
const BORDER = "#262626";
const AXIS_TEXT = "#737373";

interface SpotChartProps {
  /** spot symbol e.g. "BTCUSD", or an option symbol for premium history. */
  symbol?: string;
  /** underlying for the live candle WS (spot mode only). */
  underlying?: string;
  /** when false, the live close from useSpotCandles is not consumed. */
  live?: boolean;
  /** override the testid (OptionPremiumChart sets its own). */
  testid?: string;
}

function rawToBar(c: RawCandle): Bar | null {
  const o = toDecimal(c.open);
  const h = toDecimal(c.high);
  const l = toDecimal(c.low);
  const cl = toDecimal(c.close);
  if (o === null || h === null || l === null || cl === null) return null;
  return {
    time: c.time,
    open: o.toNumber(),
    high: h.toNumber(),
    low: l.toNumber(),
    close: cl.toNumber(),
  };
}

/** Drop the warm-up nulls and emit LineData aligned to bar time. */
function toLineData(bars: Bar[], values: (number | null)[]): LineData[] {
  const out: LineData[] = [];
  for (let i = 0; i < bars.length; i++) {
    const v = values[i];
    if (v === null || v === undefined) continue;
    out.push({ time: bars[i].time as UTCTimestamp, value: v });
  }
  return out;
}

interface OscDef {
  key: string;
  testid: string;
  title: string;
  lines: { values: (number | null)[]; color: string }[];
}

export default function SpotChart({
  symbol = "BTCUSD",
  underlying = "BTC",
  live = true,
  testid = "spot-chart",
}: SpotChartProps): JSX.Element {
  const [config, setConfig] = useState<IndicatorConfig>(defaultIndicatorConfig);

  // --- history -------------------------------------------------------------
  const now = useMemo(() => Math.floor(Date.now() / 1000), []);
  const candlesQuery = useQuery({
    queryKey: ["candles", symbol],
    queryFn: () =>
      getCandles(symbol, "1m", now - HISTORY_SECONDS, now),
    staleTime: 60_000,
  });

  // Live close (spot mode only). Hook is unconditional; we gate consumption.
  const liveClose = useSpotCandles(underlying);

  // Bars: seeded from history, sorted ascending, capped, then the live bar
  // appended/updated. Kept in a ref + state so the chart-effect can recompute
  // only the tail window on each 1Hz tick (incremental, not full-history).
  const [bars, setBars] = useState<Bar[]>([]);
  const seededRef = useRef(false);

  useEffect(() => {
    const data = candlesQuery.data;
    if (!data || seededRef.current) return;
    seededRef.current = true;
    const parsed = data.candles
      .map(rawToBar)
      .filter((b): b is Bar => b !== null)
      .sort((a, b) => a.time - b.time);
    setBars(parsed.slice(-MAX_BARS));
  }, [candlesQuery.data]);

  // Append the live bar at most ~1Hz. Aligns to the minute bucket: same minute
  // updates the in-progress bar, a new minute appends a fresh bar.
  const lastTickRef = useRef(0);
  useEffect(() => {
    if (!live) return;
    const px = toDecimal(liveClose);
    if (px === null) return;
    const nowMs = Date.now();
    if (nowMs - lastTickRef.current < 1000) return; // throttle to 1Hz
    lastTickRef.current = nowMs;
    const minute = (Math.floor(nowMs / 60000) * 60) as number;
    const value = px.toNumber();
    setBars((prev) => {
      if (prev.length === 0) {
        return [
          { time: minute, open: value, high: value, low: value, close: value },
        ];
      }
      const last = prev[prev.length - 1];
      if (last.time === minute) {
        const updated: Bar = {
          ...last,
          high: Math.max(last.high, value),
          low: Math.min(last.low, value),
          close: value,
        };
        return [...prev.slice(0, -1), updated];
      }
      if (minute < last.time) return prev; // out-of-order guard
      const next = [
        ...prev,
        { time: minute, open: value, high: value, low: value, close: value },
      ];
      return next.length > MAX_BARS ? next.slice(next.length - MAX_BARS) : next;
    });
  }, [liveClose, live]);

  // --- main chart (candles + overlays) -------------------------------------
  const mainRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  // overlay line series keyed by a stable id.
  const overlayRef = useRef<Map<string, ISeriesApi<"Line">>>(new Map());

  useEffect(() => {
    const container = mainRef.current;
    if (!container) return;
    const overlays = overlayRef.current;
    const chart = createChart(container, {
      width: container.clientWidth,
      height: container.clientHeight || 280,
      layout: { background: { color: CHART_BG }, textColor: AXIS_TEXT },
      grid: { vertLines: { color: GRID }, horzLines: { color: GRID } },
      rightPriceScale: { borderColor: BORDER },
      timeScale: { borderColor: BORDER, timeVisible: true, secondsVisible: false },
    });
    const candles = chart.addCandlestickSeries({
      upColor: "#10b981",
      downColor: "#ef4444",
      borderUpColor: "#10b981",
      borderDownColor: "#ef4444",
      wickUpColor: "#10b981",
      wickDownColor: "#ef4444",
    });
    chartRef.current = chart;
    candleSeriesRef.current = candles;

    const onResize = (): void => {
      if (mainRef.current) {
        chart.applyOptions({ width: mainRef.current.clientWidth });
      }
    };
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      chart.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
      overlays.clear();
    };
  }, []);

  // Push candles + overlays. setData on a CAPPED window (<= MAX_BARS) — this is
  // the bounded "tail recompute": indicators run over the window only, never
  // the whole unbounded history.
  useEffect(() => {
    const candles = candleSeriesRef.current;
    const chart = chartRef.current;
    if (!candles || !chart) return;

    const cData: CandlestickData[] = bars.map((b) => ({
      time: b.time as UTCTimestamp,
      open: b.open,
      high: b.high,
      low: b.low,
      close: b.close,
    }));
    candles.setData(cData);

    // Reconcile overlay series with the active config.
    const wanted = new Map<string, { data: LineData[]; color: string }>();
    if (config.ema.enabled) {
      const colors = ["#3b82f6", "#a855f7", "#f59e0b"];
      config.ema.periods.forEach((p, i) => {
        wanted.set(`ema-${p}`, {
          data: toLineData(bars, ema(bars, p)),
          color: colors[i % colors.length],
        });
      });
    }
    if (config.bbands.enabled) {
      const bb = bbands(bars, config.bbands.period, config.bbands.mult);
      wanted.set("bb-upper", { data: toLineData(bars, bb.upper), color: "#64748b" });
      wanted.set("bb-middle", { data: toLineData(bars, bb.middle), color: "#94a3b8" });
      wanted.set("bb-lower", { data: toLineData(bars, bb.lower), color: "#64748b" });
    }

    const overlays = overlayRef.current;
    // remove series no longer wanted
    for (const [key, series] of overlays) {
      if (!wanted.has(key)) {
        chart.removeSeries(series);
        overlays.delete(key);
      }
    }
    // add/update wanted series
    for (const [key, { data, color }] of wanted) {
      let series = overlays.get(key);
      if (!series) {
        series = chart.addLineSeries({ color, lineWidth: 1, priceLineVisible: false, lastValueVisible: false });
        overlays.set(key, series);
      } else {
        series.applyOptions({ color });
      }
      series.setData(data);
    }
  }, [bars, config]);

  // --- oscillator definitions (recomputed from bars + config) --------------
  const oscillators: OscDef[] = useMemo(() => {
    const defs: OscDef[] = [];
    if (config.adx.enabled) {
      const a = adx(bars, config.adx.period);
      defs.push({
        key: "adx",
        testid: "osc-adx",
        title: `ADX(${config.adx.period})`,
        lines: [
          { values: a.adx, color: "#eab308" },
          { values: a.plusDI, color: "#10b981" },
          { values: a.minusDI, color: "#ef4444" },
        ],
      });
    }
    if (config.rsi.enabled) {
      defs.push({
        key: "rsi",
        testid: "osc-rsi",
        title: `RSI(${config.rsi.period})`,
        lines: [{ values: rsi(bars, config.rsi.period), color: "#a855f7" }],
      });
    }
    if (config.macd.enabled) {
      const m = macd(bars, config.macd.fast, config.macd.slow, config.macd.signal);
      defs.push({
        key: "macd",
        testid: "osc-macd",
        title: `MACD(${config.macd.fast},${config.macd.slow},${config.macd.signal})`,
        lines: [
          { values: m.macd, color: "#3b82f6" },
          { values: m.signal, color: "#f59e0b" },
          { values: m.hist, color: "#64748b" },
        ],
      });
    }
    if (config.atr.enabled) {
      defs.push({
        key: "atr",
        testid: "osc-atr",
        title: `ATR(${config.atr.period})`,
        lines: [{ values: atr(bars, config.atr.period), color: "#22d3ee" }],
      });
    }
    return defs;
  }, [bars, config]);

  return (
    <div className="flex flex-col gap-2" data-testid={testid}>
      <IndicatorPanel config={config} onChange={setConfig} />
      <div className="relative h-72 w-full rounded border border-[var(--color-border)] bg-bg">
        <div ref={mainRef} className="h-full w-full" data-testid="spot-chart-main" />
        {bars.length === 0 && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-neutral">
            {candlesQuery.isLoading ? "Loading candles…" : "No candle data"}
          </div>
        )}
      </div>
      {oscillators.map((osc) => (
        <OscillatorPane key={osc.key} bars={bars} osc={osc} />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// One oscillator subpane = a small standalone Lightweight Chart, kept in sync
// with the main chart's time domain by sharing the same bar times.
// ---------------------------------------------------------------------------
function OscillatorPane({
  bars,
  osc,
}: {
  bars: Bar[];
  osc: OscDef;
}): JSX.Element {
  const ref = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Line">[]>([]);

  useEffect(() => {
    const container = ref.current;
    if (!container) return;
    const chart = createChart(container, {
      width: container.clientWidth,
      height: container.clientHeight || 110,
      layout: { background: { color: CHART_BG }, textColor: AXIS_TEXT },
      grid: { vertLines: { color: GRID }, horzLines: { color: GRID } },
      rightPriceScale: { borderColor: BORDER },
      timeScale: { borderColor: BORDER, timeVisible: true, secondsVisible: false },
    });
    chartRef.current = chart;
    seriesRef.current = osc.lines.map((l) =>
      chart.addLineSeries({
        color: l.color,
        lineWidth: 1,
        priceLineVisible: false,
        lastValueVisible: false,
      }),
    );
    const onResize = (): void => {
      if (ref.current) chart.applyOptions({ width: ref.current.clientWidth });
    };
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      chart.remove();
      chartRef.current = null;
      seriesRef.current = [];
    };
    // Recreate the chart + series only when the *number* of lines changes
    // (i.e. a different oscillator type). Line data/colors are pushed in the
    // separate effect below, so we deliberately exclude `osc.lines`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [osc.lines.length]);

  useEffect(() => {
    const series = seriesRef.current;
    if (series.length !== osc.lines.length) return;
    osc.lines.forEach((l, i) => {
      series[i].applyOptions({ color: l.color });
      series[i].setData(toLineData(bars, l.values));
    });
  }, [bars, osc]);

  return (
    <div
      className="relative h-28 w-full rounded border border-[var(--color-border)] bg-bg"
      data-testid={osc.testid}
    >
      <div className="pointer-events-none absolute left-2 top-1 z-10 text-[11px] text-neutral">
        {osc.title}
      </div>
      <div ref={ref} className="h-full w-full" />
    </div>
  );
}
