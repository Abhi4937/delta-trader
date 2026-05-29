// Live-monitor WS state (ADR 0004 §9): the latest live positions snapshot and
// per-strategy SL state, fed from the single WS singleton in ws.ts. The flush in
// ws.ts already RAF-coalesces frames, so we just keep the freshest snapshot per
// channel and apply them in one set() per tick — exactly like paperStore.

import { create } from "zustand";
import type { LivePosition } from "../lib/liveApi";
import {
  onLivePositionsFrame,
  onLiveStrategyFrame,
  subscribeLivePositions as wsSubPositions,
  unsubscribeLivePositions as wsUnsubPositions,
  subscribeLiveStrategy as wsSubStrategy,
  unsubscribeLiveStrategy as wsUnsubStrategy,
  type LivePositionsFrame,
  type LiveStrategyFrame,
} from "../lib/ws";

export interface LiveStoreState {
  /** latest positions snapshot from the WS (null until first frame) */
  positions: LivePosition[] | null;
  /** latest sl_state keyed by strategy id (live SL-badge source) */
  slState: Record<number, string | null>;
  /** ref-counts so multiple components share one WS subscription */
  _posRefs: number;
  _stratRefs: Record<number, number>;
  subscribePositions: () => void;
  unsubscribePositions: () => void;
  subscribeStrategy: (id: number) => void;
  unsubscribeStrategy: (id: number) => void;
  _applyPositions: (frame: LivePositionsFrame) => void;
  _applyStrategy: (frame: LiveStrategyFrame) => void;
}

function frameToPositions(f: LivePositionsFrame): LivePosition[] {
  return f.rows.map((r) => ({
    symbol: r.symbol,
    size: r.size,
    entry_price: r.entry_price,
    mark_price: r.mark_price,
    contract_size: r.contract_size,
    margin: r.margin,
    unrealized: r.unrealized,
    product_id: r.product_id,
  }));
}

export const useLiveStore = create<LiveStoreState>((set, get) => ({
  positions: null,
  slState: {},
  _posRefs: 0,
  _stratRefs: {},
  _applyPositions: (frame) => set({ positions: frameToPositions(frame) }),
  _applyStrategy: (frame) =>
    set((state) => ({
      slState: { ...state.slState, [frame.id]: frame.sl_state ?? null },
    })),
  subscribePositions: () => {
    const refs = get()._posRefs + 1;
    set({ _posRefs: refs });
    wsSubPositions();
  },
  unsubscribePositions: () => {
    const refs = get()._posRefs - 1;
    if (refs <= 0) {
      set({ _posRefs: 0 });
      wsUnsubPositions();
    } else {
      set({ _posRefs: refs });
    }
  },
  subscribeStrategy: (id) => {
    const refs = { ...get()._stratRefs };
    refs[id] = (refs[id] ?? 0) + 1;
    set({ _stratRefs: refs });
    wsSubStrategy(id);
  },
  unsubscribeStrategy: (id) => {
    const refs = { ...get()._stratRefs };
    const next = (refs[id] ?? 0) - 1;
    if (next <= 0) {
      delete refs[id];
      wsUnsubStrategy(id);
    } else {
      refs[id] = next;
    }
    set({ _stratRefs: refs });
  },
}));

// Wire the single WS listeners once. The flush in ws.ts already RAF-batches.
let wired = false;
function ensureWired(): void {
  if (wired) return;
  wired = true;
  onLivePositionsFrame((frame) => {
    useLiveStore.getState()._applyPositions(frame);
  });
  onLiveStrategyFrame((frame) => {
    useLiveStore.getState()._applyStrategy(frame);
  });
}
ensureWired();
