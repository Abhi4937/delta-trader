import { describe, expect, it, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { useKeyboardShortcuts } from "../../src/hooks/useKeyboardShortcuts";

function Harness({
  onGoPaper,
  onHelp,
}: {
  onGoPaper: () => void;
  onHelp: () => void;
}): JSX.Element {
  useKeyboardShortcuts({ onGoPaper, onHelp });
  return <input data-testid="field" />;
}

describe("useKeyboardShortcuts", () => {
  it("ignores shortcuts while an input is focused", () => {
    const onGoPaper = vi.fn();
    const onHelp = vi.fn();
    const { getByTestId } = render(
      <Harness onGoPaper={onGoPaper} onHelp={onHelp} />,
    );
    const field = getByTestId("field") as HTMLInputElement;
    field.focus();

    // `g` then `p` while typing -> ignored.
    fireEvent.keyDown(field, { key: "g" });
    fireEvent.keyDown(field, { key: "p" });
    fireEvent.keyDown(field, { key: "?" });

    expect(onGoPaper).not.toHaveBeenCalled();
    expect(onHelp).not.toHaveBeenCalled();
  });

  it("fires the g-p chord when not typing", () => {
    const onGoPaper = vi.fn();
    const onHelp = vi.fn();
    render(<Harness onGoPaper={onGoPaper} onHelp={onHelp} />);

    // Dispatch on document.body (not an input target).
    fireEvent.keyDown(document.body, { key: "g" });
    fireEvent.keyDown(document.body, { key: "p" });
    expect(onGoPaper).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(document.body, { key: "?" });
    expect(onHelp).toHaveBeenCalledTimes(1);
  });
});
