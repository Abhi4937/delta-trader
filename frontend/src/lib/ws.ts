import { create } from "zustand";
import type { OptionRow } from "./api";

// ---------------------------------------------------------------------------
// Wire message shapes (server -> client). See ADR 0002 §7.
// ---------------------------------------------------------------------------
interface SubscribedFrame {
  ch: "subscribed";
  [k: string]: unknown;
}
interface OptionChainFrame {
  ch: "option_chain";
  underlying: string;
  expiry: string;
  ts?: string;
  rows: OptionRow[];
}
interface CandleFrame {
  ch: "candle";
  underlying: string;
  close: string;
  ts?: string;
}
interface ErrorFrame {
  ch: "error";
  msg: string;
}
type ServerFrame =
  | SubscribedFrame
  | OptionChainFrame
  | CandleFrame
  | ErrorFrame
  | { ch: string; [k: string]: unknown };

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------
export interface ChainState {
  /** latest option_chain rows keyed by expiry code */
  chains: Record<string, OptionRow[]>;
  /** latest spot candle close (string|null) */
  spotClose: string | null;
  connected: boolean;
  /** internal: apply a coalesced batch of frames */
  _applyBatch: (frames: ServerFrame[]) => void;
  _setConnected: (c: boolean) => void;
}

export const useChainStore = create<ChainState>((set) => ({
  chains: {},
  spotClose: null,
  connected: false,
  _applyBatch: (frames) =>
    set((state) => {
      let chains = state.chains;
      let spotClose = state.spotClose;
      let chainsTouched = false;
      for (const f of frames) {
        if (f.ch === "option_chain") {
          const cf = f as OptionChainFrame;
          if (!chainsTouched) {
            chains = { ...chains };
            chainsTouched = true;
          }
          chains[cf.expiry] = cf.rows;
        } else if (f.ch === "candle") {
          const cdf = f as CandleFrame;
          spotClose = cdf.close;
        }
      }
      return { chains, spotClose };
    }),
  _setConnected: (c) => set({ connected: c }),
}));

// ---------------------------------------------------------------------------
// Singleton WebSocket with RAF-batched flush.
// ---------------------------------------------------------------------------
type SubMsg =
  | { sub: "option_chain"; underlying: string; expiry: string }
  | { sub: "candles"; underlying: string };

let socket: WebSocket | null = null;
let queue: ServerFrame[] = [];
let rafId: number | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
// Desired subscriptions — the single source of truth replayed on (re)connect.
const desiredSubs = new Map<string, SubMsg>();

function hasWindow(): boolean {
  return typeof window !== "undefined" && typeof WebSocket !== "undefined";
}

function wsUrl(): string {
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${window.location.host}/ws`;
}

function startFlushLoop(): void {
  if (rafId !== null || !hasWindow()) return;
  const tick = (): void => {
    if (queue.length) {
      const batch = queue;
      queue = [];
      useChainStore.getState()._applyBatch(batch);
    }
    rafId = requestAnimationFrame(tick);
  };
  rafId = requestAnimationFrame(tick);
}

function send(msg: SubMsg): void {
  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(msg));
  }
}

function replayAll(): void {
  for (const msg of desiredSubs.values()) send(msg);
}

function ensureSocket(): void {
  if (!hasWindow() || socket) return;

  startFlushLoop();
  const ws = new WebSocket(wsUrl());
  socket = ws;

  ws.onopen = () => {
    useChainStore.getState()._setConnected(true);
    replayAll();
  };

  ws.onmessage = (ev: MessageEvent<string>) => {
    try {
      const frame = JSON.parse(ev.data) as ServerFrame;
      // never setState here — push to queue, flush in RAF
      queue.push(frame);
    } catch {
      // ignore malformed frames
    }
  };

  const scheduleReconnect = (): void => {
    if (socket === ws) socket = null;
    useChainStore.getState()._setConnected(false);
    if (reconnectTimer !== null) return;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      ensureSocket();
    }, 1000);
  };

  ws.onclose = scheduleReconnect;
  ws.onerror = () => {
    // onclose will follow and handle reconnection.
  };
}

// ---------------------------------------------------------------------------
// Public actions
// ---------------------------------------------------------------------------
export function subscribeOptionChain(underlying: string, expiry: string): void {
  if (!hasWindow()) return;
  const key = `option_chain:${underlying}:${expiry}`;
  desiredSubs.set(key, { sub: "option_chain", underlying, expiry });
  ensureSocket();
  send({ sub: "option_chain", underlying, expiry });
}

export function subscribeCandles(underlying: string): void {
  if (!hasWindow()) return;
  const key = `candles:${underlying}`;
  desiredSubs.set(key, { sub: "candles", underlying });
  ensureSocket();
  send({ sub: "candles", underlying });
}
