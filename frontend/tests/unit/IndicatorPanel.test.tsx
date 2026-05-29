import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import IndicatorPanel, {
  defaultIndicatorConfig,
  type IndicatorConfig,
} from "../../src/components/indicators/IndicatorPanel";

describe("IndicatorPanel", () => {
  it("renders all indicator toggles with ADX enabled by default", () => {
    const cfg = defaultIndicatorConfig();
    render(<IndicatorPanel config={cfg} onChange={() => {}} />);
    expect(screen.getByTestId("indicator-panel")).toBeInTheDocument();
    for (const id of [
      "ind-toggle-ema",
      "ind-toggle-bbands",
      "ind-toggle-rsi",
      "ind-toggle-macd",
      "ind-toggle-atr",
      "ind-toggle-adx",
    ]) {
      expect(screen.getByTestId(id)).toBeInTheDocument();
    }
    expect(screen.getByTestId("ind-toggle-adx")).toBeChecked();
    expect(screen.getByTestId("ind-toggle-rsi")).not.toBeChecked();
  });

  it("emits an updated config when a toggle flips", () => {
    const cfg = defaultIndicatorConfig();
    const onChange = vi.fn<(next: IndicatorConfig) => void>();
    render(<IndicatorPanel config={cfg} onChange={onChange} />);
    fireEvent.click(screen.getByTestId("ind-toggle-rsi"));
    expect(onChange).toHaveBeenCalledTimes(1);
    const next = onChange.mock.calls[0][0];
    expect(next.rsi.enabled).toBe(true);
    expect(next.adx.enabled).toBe(true); // unchanged
  });

  it("exposes period inputs when an indicator is enabled", () => {
    const cfg: IndicatorConfig = {
      ...defaultIndicatorConfig(),
      ema: { enabled: true, periods: [20, 50] },
    };
    render(<IndicatorPanel config={cfg} onChange={() => {}} />);
    expect(screen.getByTestId("ind-ema-period-0")).toHaveValue(20);
    expect(screen.getByTestId("ind-ema-period-1")).toHaveValue(50);
  });
});
