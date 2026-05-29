import { useEffect, useRef } from "react";

export interface ShortcutHandlers {
  /** focus the search / expiry control (the "/" key) */
  onSearch?: () => void;
  /** g p — Paper Trade tab */
  onGoPaper?: () => void;
  /** g l — Live Monitor tab */
  onGoLive?: () => void;
  /** g o — Option Chain tab */
  onGoChain?: () => void;
  /** ? — open the shortcut-help modal */
  onHelp?: () => void;
}

/** Window after pressing `g` during which the second chord key is accepted. */
const CHORD_WINDOW_MS = 1000;

/** True when focus is in a text input / textarea / select / contenteditable. */
function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  return el.isContentEditable;
}

/**
 * Global keyboard shortcuts (Phase 5 §5). Single window-level handler:
 *   /         focus search/expiry
 *   g p|l|o   two-key chord -> tab switch (press g, then the letter within ~1s)
 *   ?         shortcut-help modal
 * Shortcuts are ignored while typing in an input/textarea/select. The handler
 * is exposed as a hook so callers wire concrete actions without changing logic.
 */
export function useKeyboardShortcuts(handlers: ShortcutHandlers): void {
  // Keep latest handlers without re-binding the listener each render.
  const ref = useRef(handlers);
  ref.current = handlers;

  useEffect(() => {
    let pendingG = 0; // epoch ms of the last `g` press (0 = none)

    function onKeyDown(e: KeyboardEvent): void {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
      if (isTypingTarget(e.target)) return;

      const now = Date.now();
      const chordActive = pendingG !== 0 && now - pendingG <= CHORD_WINDOW_MS;
      const h = ref.current;

      // Resolve a pending `g` chord first.
      if (chordActive) {
        pendingG = 0;
        if (e.key === "p") {
          e.preventDefault();
          h.onGoPaper?.();
          return;
        }
        if (e.key === "l") {
          e.preventDefault();
          h.onGoLive?.();
          return;
        }
        if (e.key === "o") {
          e.preventDefault();
          h.onGoChain?.();
          return;
        }
        // Any other key cancels the chord; fall through to single-key handling.
      }

      if (e.key === "g") {
        pendingG = now;
        return;
      }
      if (e.key === "/") {
        e.preventDefault();
        h.onSearch?.();
        return;
      }
      if (e.key === "?") {
        e.preventDefault();
        h.onHelp?.();
        return;
      }
      pendingG = 0;
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}
