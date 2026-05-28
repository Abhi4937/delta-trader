import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import OptionChainTable from "../../src/components/OptionChainTable";
import type { OptionRow } from "../../src/lib/api";

// jsdom gives the scroll container zero height, so the real virtualizer would
// render no rows. Mock it to return all items so we can assert on rendering.
vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: ({ count }: { count: number }) => ({
    getTotalSize: () => count * 28,
    getVirtualItems: () =>
      Array.from({ length: count }, (_, index) => ({
        index,
        key: index,
        start: index * 28,
        size: 28,
      })),
  }),
}));

function row(symbol: string, iv: string | null, delta: string | null): OptionRow {
  return {
    symbol,
    mark_price: "1234.50",
    iv,
    delta,
    gamma: "0.0001",
    theta: "-12.3",
    vega: "45.1",
    oi: "1200",
    best_bid: "1230.0",
    best_ask: "1239.0",
  };
}

const rows: OptionRow[] = [
  row("C-BTC-90000-290526", "0.55", "0.62"),
  row("P-BTC-90000-290526", "0.58", "-0.38"),
  row("C-BTC-95000-290526", "0.50", "0.40"),
  row("P-BTC-95000-290526", "0.52", "-0.60"),
];

describe("OptionChainTable", () => {
  it("renders at least one row with a non-empty IV cell", () => {
    render(<OptionChainTable rows={rows} spot="92000" />);

    const chainRows = screen.getAllByTestId("chain-row");
    expect(chainRows.length).toBeGreaterThanOrEqual(1);

    const ivCells = screen.getAllByTestId("iv-cell");
    expect(ivCells.length).toBeGreaterThanOrEqual(1);
    const nonEmpty = ivCells.filter((c) => {
      const t = c.textContent ?? "";
      return t.trim() !== "" && t.trim() !== "—";
    });
    expect(nonEmpty.length).toBeGreaterThanOrEqual(1);
    expect(nonEmpty[0].textContent).toContain("%");
  });
});
