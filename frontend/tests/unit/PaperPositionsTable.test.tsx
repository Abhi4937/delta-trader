import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import PaperPositionsTable from "../../src/components/paper/PaperPositionsTable";
import type { PaperPosition } from "../../src/lib/paperApi";

const position: PaperPosition = {
  id: 42,
  strategy_id: 8,
  underlying: "BTC",
  status: "open",
  opened_at: "2026-05-29T10:00:00Z",
  closed_at: null,
  entry_cost: "-0.55",
  realized_pnl: "0",
  margin_estimate: "109.88",
  flags: { margin: "estimate" },
  legs: [
    {
      id: 9,
      symbol: "C-BTC-73800-290526",
      side: "sell",
      qty: "1",
      qty_open: "1",
      contract_size: "0.001",
      entry_fill: "270",
      exit_fill: null,
      status: "open",
    },
  ],
  mtm: {
    ts: "2026-05-29T10:00:01Z",
    total_pnl: "12.34",
    unrealized_pnl: "12.34",
    realized_pnl: "0",
    net_delta: "0.0001",
    net_gamma: "0",
    net_theta: "0.46",
    net_vega: "-0.02",
    strategy_iv: "0.23",
    mark_stale: false,
  },
};

describe("PaperPositionsTable", () => {
  it("renders the position's total_pnl and a Close button", () => {
    const onClose = vi.fn();
    render(
      <PaperPositionsTable
        positions={[position]}
        selectedId={null}
        onSelect={vi.fn()}
        onClose={onClose}
      />,
    );

    const row = screen.getByTestId("paper-position-row");
    expect(row).toBeInTheDocument();

    // total_pnl from the seeded mtm snapshot (falls back when no live WS frame)
    const pnlCell = screen.getByTestId("paper-mtm-42");
    expect(pnlCell.textContent).toContain("12.34");

    // Close button present
    const closeBtn = screen.getByTestId("close-position-btn");
    expect(closeBtn).toBeInTheDocument();
    expect(closeBtn.textContent).toContain("Close");
  });

  it("renders an empty state when there are no positions", () => {
    render(
      <PaperPositionsTable
        positions={[]}
        selectedId={null}
        onSelect={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByText(/No paper positions yet/i)).toBeInTheDocument();
    expect(screen.getByTestId("empty-state")).toBeInTheDocument();
  });
});
