import { useCallback } from "react";

// ---------------------------------------------------------------------------
// Indicator configuration model.
// ---------------------------------------------------------------------------
export type IndicatorKind =
  | "ema"
  | "bbands"
  | "rsi"
  | "macd"
  | "atr"
  | "adx";

/** Whether an indicator draws on the main price pane or its own oscillator pane. */
export const OVERLAY_KINDS: IndicatorKind[] = ["ema", "bbands"];

export interface IndicatorConfig {
  ema: { enabled: boolean; periods: number[] };
  bbands: { enabled: boolean; period: number; mult: number };
  rsi: { enabled: boolean; period: number };
  macd: { enabled: boolean; fast: number; slow: number; signal: number };
  atr: { enabled: boolean; period: number };
  adx: { enabled: boolean; period: number };
}

export function defaultIndicatorConfig(): IndicatorConfig {
  return {
    ema: { enabled: false, periods: [20, 50] },
    bbands: { enabled: false, period: 20, mult: 2 },
    rsi: { enabled: false, period: 14 },
    macd: { enabled: false, fast: 12, slow: 26, signal: 9 },
    atr: { enabled: false, period: 14 },
    // ADX(14) visible by default (ADR 0005 §3).
    adx: { enabled: true, period: 14 },
  };
}

interface IndicatorPanelProps {
  config: IndicatorConfig;
  onChange: (next: IndicatorConfig) => void;
}

function NumberInput({
  label,
  value,
  min = 1,
  max = 500,
  step = 1,
  testid,
  onChange,
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  testid?: string;
  onChange: (v: number) => void;
}): JSX.Element {
  return (
    <label className="flex items-center gap-1 text-[11px] text-neutral">
      {label}
      <input
        type="number"
        className="w-14 rounded border border-[var(--color-border)] bg-bg px-1 py-0.5 text-right font-mono tabular-nums text-text"
        value={value}
        min={min}
        max={max}
        step={step}
        data-testid={testid}
        onChange={(e) => {
          const v = Number(e.target.value);
          if (Number.isFinite(v) && v >= min && v <= max) onChange(v);
        }}
      />
    </label>
  );
}

function Toggle({
  label,
  checked,
  testid,
  onChange,
  children,
}: {
  label: string;
  checked: boolean;
  testid: string;
  onChange: (v: boolean) => void;
  children?: React.ReactNode;
}): JSX.Element {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded border border-[var(--color-border)] px-2 py-1">
      <label className="flex items-center gap-1.5 text-xs text-text">
        <input
          type="checkbox"
          checked={checked}
          data-testid={testid}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span className="font-medium">{label}</span>
      </label>
      {checked && children}
    </div>
  );
}

export default function IndicatorPanel({
  config,
  onChange,
}: IndicatorPanelProps): JSX.Element {
  const patch = useCallback(
    (p: Partial<IndicatorConfig>) => onChange({ ...config, ...p }),
    [config, onChange],
  );

  return (
    <div
      className="flex flex-wrap items-start gap-2"
      data-testid="indicator-panel"
    >
      {/* EMA — overlay, two configurable periods */}
      <Toggle
        label="EMA"
        checked={config.ema.enabled}
        testid="ind-toggle-ema"
        onChange={(enabled) => patch({ ema: { ...config.ema, enabled } })}
      >
        <NumberInput
          label="fast"
          value={config.ema.periods[0] ?? 20}
          testid="ind-ema-period-0"
          onChange={(v) =>
            patch({
              ema: {
                ...config.ema,
                periods: [v, config.ema.periods[1] ?? 50],
              },
            })
          }
        />
        <NumberInput
          label="slow"
          value={config.ema.periods[1] ?? 50}
          testid="ind-ema-period-1"
          onChange={(v) =>
            patch({
              ema: {
                ...config.ema,
                periods: [config.ema.periods[0] ?? 20, v],
              },
            })
          }
        />
      </Toggle>

      {/* Bollinger — overlay */}
      <Toggle
        label="BBands"
        checked={config.bbands.enabled}
        testid="ind-toggle-bbands"
        onChange={(enabled) => patch({ bbands: { ...config.bbands, enabled } })}
      >
        <NumberInput
          label="n"
          value={config.bbands.period}
          testid="ind-bbands-period"
          onChange={(v) => patch({ bbands: { ...config.bbands, period: v } })}
        />
        <NumberInput
          label="σ"
          value={config.bbands.mult}
          min={1}
          max={5}
          step={0.5}
          testid="ind-bbands-mult"
          onChange={(v) => patch({ bbands: { ...config.bbands, mult: v } })}
        />
      </Toggle>

      {/* RSI — oscillator */}
      <Toggle
        label="RSI"
        checked={config.rsi.enabled}
        testid="ind-toggle-rsi"
        onChange={(enabled) => patch({ rsi: { ...config.rsi, enabled } })}
      >
        <NumberInput
          label="n"
          value={config.rsi.period}
          testid="ind-rsi-period"
          onChange={(v) => patch({ rsi: { ...config.rsi, period: v } })}
        />
      </Toggle>

      {/* MACD — oscillator */}
      <Toggle
        label="MACD"
        checked={config.macd.enabled}
        testid="ind-toggle-macd"
        onChange={(enabled) => patch({ macd: { ...config.macd, enabled } })}
      >
        <NumberInput
          label="f"
          value={config.macd.fast}
          testid="ind-macd-fast"
          onChange={(v) => patch({ macd: { ...config.macd, fast: v } })}
        />
        <NumberInput
          label="s"
          value={config.macd.slow}
          testid="ind-macd-slow"
          onChange={(v) => patch({ macd: { ...config.macd, slow: v } })}
        />
        <NumberInput
          label="sig"
          value={config.macd.signal}
          testid="ind-macd-signal"
          onChange={(v) => patch({ macd: { ...config.macd, signal: v } })}
        />
      </Toggle>

      {/* ATR — oscillator */}
      <Toggle
        label="ATR"
        checked={config.atr.enabled}
        testid="ind-toggle-atr"
        onChange={(enabled) => patch({ atr: { ...config.atr, enabled } })}
      >
        <NumberInput
          label="n"
          value={config.atr.period}
          testid="ind-atr-period"
          onChange={(v) => patch({ atr: { ...config.atr, period: v } })}
        />
      </Toggle>

      {/* ADX — oscillator, on by default */}
      <Toggle
        label="ADX"
        checked={config.adx.enabled}
        testid="ind-toggle-adx"
        onChange={(enabled) => patch({ adx: { ...config.adx, enabled } })}
      >
        <NumberInput
          label="n"
          value={config.adx.period}
          testid="ind-adx-period"
          onChange={(v) => patch({ adx: { ...config.adx, period: v } })}
        />
      </Toggle>
    </div>
  );
}
