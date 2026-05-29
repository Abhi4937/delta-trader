import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import StopLossDialog from "../../src/components/live/StopLossDialog";

function renderDialog(): void {
  const qc = new QueryClient();
  render(
    <QueryClientProvider client={qc}>
      <StopLossDialog
        strategyId={1}
        strategyName="Test Strategy"
        slState={null}
        onClose={vi.fn()}
      />
    </QueryClientProvider>,
  );
}

describe("StopLossDialog", () => {
  it("disables the confirm button until the understand checkbox is checked", () => {
    renderDialog();

    const confirm = screen.getByTestId("sl-confirm-btn") as HTMLButtonElement;
    const checkbox = screen.getByTestId(
      "sl-understand-checkbox",
    ) as HTMLInputElement;
    const threshold = screen.getByTestId(
      "sl-threshold-abs",
    ) as HTMLInputElement;

    // A valid threshold alone is not enough — still disabled without the ack.
    fireEvent.change(threshold, { target: { value: "500" } });
    expect(confirm.disabled).toBe(true);

    // Checking the ack with a valid threshold enables it.
    fireEvent.click(checkbox);
    expect(checkbox.checked).toBe(true);
    expect(confirm.disabled).toBe(false);

    // Un-checking disables it again.
    fireEvent.click(checkbox);
    expect(confirm.disabled).toBe(true);
  });

  it("stays disabled when checked but no threshold is entered", () => {
    renderDialog();
    const confirm = screen.getByTestId("sl-confirm-btn") as HTMLButtonElement;
    const checkbox = screen.getByTestId(
      "sl-understand-checkbox",
    ) as HTMLInputElement;

    fireEvent.click(checkbox);
    expect(confirm.disabled).toBe(true);
  });
});
