import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import ConnectionBadge from "../../src/components/ConnectionBadge";
import { useChainStore, type WsStatus } from "../../src/lib/ws";

function setStatus(status: WsStatus): void {
  useChainStore.setState({ status, lastMessageAt: Date.now() });
}

describe("ConnectionBadge", () => {
  it("renders the connected label and status attr", () => {
    setStatus("connected");
    render(<ConnectionBadge />);
    const badge = screen.getByTestId("connection-badge");
    expect(badge).toHaveAttribute("data-status", "connected");
    expect(badge.textContent).toContain("Connected");
  });

  it("renders the reconnecting label", () => {
    setStatus("reconnecting");
    render(<ConnectionBadge />);
    const badge = screen.getByTestId("connection-badge");
    expect(badge).toHaveAttribute("data-status", "reconnecting");
    expect(badge.textContent).toContain("Reconnecting");
  });

  it("renders the disconnected label", () => {
    setStatus("disconnected");
    render(<ConnectionBadge />);
    const badge = screen.getByTestId("connection-badge");
    expect(badge).toHaveAttribute("data-status", "disconnected");
    expect(badge.textContent).toContain("Disconnected");
  });
});
