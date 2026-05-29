import { useEffect } from "react";
import { X } from "lucide-react";

interface ShortcutHelpProps {
  onClose: () => void;
}

const SHORTCUTS: Array<{ keys: string[]; label: string }> = [
  { keys: ["/"], label: "Focus expiry / search" },
  { keys: ["g", "o"], label: "Go to Option Chain" },
  { keys: ["g", "p"], label: "Go to Paper Trade" },
  { keys: ["g", "l"], label: "Go to Live Monitor" },
  { keys: ["?"], label: "Toggle this help" },
];

/** Keyboard-shortcut help modal (Phase 5 §5). Esc or the close button dismisses. */
export default function ShortcutHelp({ onClose }: ShortcutHelpProps): JSX.Element {
  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      role="dialog"
      aria-modal="true"
      data-testid="shortcut-help"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded border border-[var(--color-border)] bg-[var(--color-panel)] shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-3">
          <h2 className="text-sm font-semibold text-text">Keyboard shortcuts</h2>
          <button
            className="text-neutral hover:text-text"
            onClick={onClose}
            aria-label="Close shortcuts"
          >
            <X size={18} />
          </button>
        </div>
        <ul className="flex flex-col gap-2 px-4 py-3 text-sm">
          {SHORTCUTS.map((s) => (
            <li key={s.label} className="flex items-center justify-between gap-4">
              <span className="text-text">{s.label}</span>
              <span className="flex items-center gap-1">
                {s.keys.map((k) => (
                  <kbd
                    key={k}
                    className="rounded border border-[var(--color-border)] bg-bg px-1.5 py-0.5 font-mono text-xs text-text"
                  >
                    {k}
                  </kbd>
                ))}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
