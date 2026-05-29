import { useEffect, useRef, useState } from "react";
import type { Mtm } from "../lib/paperApi";
import { usePaperStore } from "../store/paperStore";

/**
 * Subscribe a position to the live WS `paper_position` topic and return its
 * latest MTM, *throttled* to at most `hz` renders/sec (per the throttling skill:
 * PnL number 4Hz, greeks 1Hz). The underlying store updates whenever a frame
 * arrives (<=2Hz from the hub); we sample it on a timer so heavy panels (chart,
 * greeks) re-render less often than the raw number.
 */
export function usePaperMtm(id: number | null, hz = 4): Mtm | null {
  const [snapshot, setSnapshot] = useState<Mtm | null>(null);
  const latestRef = useRef<Mtm | null>(null);

  // Keep a ref of the freshest store value without re-rendering on every frame.
  useEffect(() => {
    if (id === null) {
      latestRef.current = null;
      setSnapshot(null);
      return;
    }
    const sub = usePaperStore.getState().subscribePaperPosition;
    const unsub = usePaperStore.getState().unsubscribe;
    sub(id);

    const unsubStore = usePaperStore.subscribe((state) => {
      latestRef.current = state.mtm[id] ?? latestRef.current;
    });

    // seed immediately if present
    latestRef.current = usePaperStore.getState().mtm[id] ?? null;
    setSnapshot(latestRef.current);

    const interval = window.setInterval(() => {
      setSnapshot(latestRef.current);
    }, Math.max(1, Math.floor(1000 / hz)));

    return () => {
      window.clearInterval(interval);
      unsubStore();
      unsub(id);
    };
  }, [id, hz]);

  return snapshot;
}
