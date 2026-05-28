// Live MTM state per paper position id, fed by the WS `paper_position` topic.
// Reuses the single WS singleton in ws.ts (ADR 0003 §10) and its RAF-coalesced
// flush — frames are already batched there, so we just keep the latest snapshot
// per id and apply them in one set() per RAF tick.

import { create } from "zustand";
import type { Mtm } from "../lib/paperApi";
import {
  onPaperFrame,
  subscribePaperPosition as wsSubscribe,
  unsubscribePaperPosition as wsUnsubscribe,
  type PaperPositionFrame,
} from "../lib/ws";

export interface PaperStoreState {
  /** latest MTM snapshot keyed by position id */
  mtm: Record<number, Mtm>;
  /** ref-count of subscribers per id (so multiple components share one sub) */
  _refs: Record<number, number>;
  subscribePaperPosition: (id: number) => void;
  unsubscribe: (id: number) => void;
  _apply: (frame: PaperPositionFrame) => void;
}

function frameToMtm(f: PaperPositionFrame): Mtm {
  return {
    ts: f.ts,
    total_pnl: f.total_pnl,
    unrealized_pnl: f.unrealized_pnl,
    realized_pnl: f.realized_pnl,
    net_delta: f.net_delta,
    net_gamma: f.net_gamma,
    net_theta: f.net_theta,
    net_vega: f.net_vega,
    strategy_iv: f.strategy_iv,
    mark_stale: f.mark_stale,
  };
}

export const usePaperStore = create<PaperStoreState>((set, get) => ({
  mtm: {},
  _refs: {},
  _apply: (frame) =>
    set((state) => ({
      mtm: { ...state.mtm, [frame.id]: frameToMtm(frame) },
    })),
  subscribePaperPosition: (id) => {
    const refs = { ...get()._refs };
    refs[id] = (refs[id] ?? 0) + 1;
    set({ _refs: refs });
    wsSubscribe(id);
  },
  unsubscribe: (id) => {
    const refs = { ...get()._refs };
    const next = (refs[id] ?? 0) - 1;
    if (next <= 0) {
      delete refs[id];
      wsUnsubscribe(id);
    } else {
      refs[id] = next;
    }
    set({ _refs: refs });
  },
}));

// Wire the single WS listener once. The flush in ws.ts already RAF-batches, so
// we simply forward each paper frame to the store.
let wired = false;
function ensureWired(): void {
  if (wired) return;
  wired = true;
  onPaperFrame((frame) => {
    usePaperStore.getState()._apply(frame);
  });
}
ensureWired();
