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
/** Live MTM push for a paper position (ADR 0003 §10). Numbers are strings. */
export interface PaperPositionFrame {
  ch: "paper_position";
  id: number;
  ts: string;
  total_pnl: string;
  unrealized_pnl: string;
  realized_pnl: string;
  net_delta: string;
  net_gamma: string;
  net_theta: string;
  net_vega: string;
  strategy_iv: string;
  mark_stale: boolean | string;
}
/** Live positions snapshot push (ADR 0004 §9). Numbers are strings. */
export interface LivePositionsFrame {
  ch: "live_positions";
  ts?: string;
  rows: Array<{
    symbol: string;
    size: string;
    entry_price: string;
    mark_price: string;
    contract_size: string;
    margin: string;
    unrealized: string;
    product_id: number | string;
  }>;
}

/** Live strategy aggregate + SL-state push (ADR 0004 §9). Drives the SL badge. */
export interface LiveStrategyFrame {
  ch: "live_strategy";
  id: number;
  ts?: string;
  sl_state: string | null;
  total_pnl?: string;
  unrealized_pnl?: string;
  net_delta?: string;
  net_gamma?: string;
  net_theta?: string;
  net_vega?: string;
  strategy_iv?: string;
  margin?: string;
  mark_stale?: boolean | string;
}

type ServerFrame =
  | SubscribedFrame
  | OptionChainFrame
  | CandleFrame
  | ErrorFrame
  | PaperPositionFrame
  | LivePositionsFrame
  | LiveStrategyFrame
  | { ch: string; [k: string]: unknown };

// Listeners for paper_position frames — the paperStore registers one here so we
// keep a single WS connection (ADR 0003 §10 reuses the existing /ws hub).
type PaperFrameListener = (frame: PaperPositionFrame) => void;
const paperListeners = new Set<PaperFrameListener>();
export function onPaperFrame(fn: PaperFrameListener): () => void {
  paperListeners.add(fn);
  return () => {
    paperListeners.delete(fn);
  };
}

// Live-monitor frame listeners — the liveStore registers these so we keep the
// single WS connection (ADR 0004 §9 reuses the existing /ws hub).
type LivePositionsListener = (frame: LivePositionsFrame) => void;
const livePositionsListeners = new Set<LivePositionsListener>();
export function onLivePositionsFrame(fn: LivePositionsListener): () => void {
  livePositionsListeners.add(fn);
  return () => {
    livePositionsListeners.delete(fn);
  };
}

type LiveStrategyListener = (frame: LiveStrategyFrame) => void;
const liveStrategyListeners = new Set<LiveStrategyListener>();
export function onLiveStrategyFrame(fn: LiveStrategyListener): () => void {
  liveStrategyListeners.add(fn);
  return () => {
    liveStrategyListeners.delete(fn);
  };
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------
/** Coarse WS connection status surfaced to the UI (ConnectionBadge). */
export type WsStatus = "connected" | "reconnecting" | "disconnected";

export interface ChainState {
  /** latest option_chain rows keyed by expiry code */
  chains: Record<string, OptionRow[]>;
  /** latest spot candle close (string|null) */
  spotClose: string | null;
  connected: boolean;
  /** coarse connection status for the ConnectionBadge */
  status: WsStatus;
  /** epoch ms of the last message received (null = none yet) */
  lastMessageAt: number | null;
  /** internal: apply a coalesced batch of frames */
  _applyBatch: (frames: ServerFrame[]) => void;
  _setConnected: (c: boolean) => void;
  _setStatus: (s: WsStatus) => void;
}

export const useChainStore = create<ChainState>((set) => ({
  chains: {},
  spotClose: null,
  connected: false,
  status: "disconnected",
  lastMessageAt: null,
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
      // Stamp the last-message time once per flushed batch (RAF cadence).
      return { chains, spotClose, lastMessageAt: Date.now() };
    }),
  _setConnected: (c) =>
    set({ connected: c, status: c ? "connected" : "disconnected" }),
  _setStatus: (s) => set({ status: s }),
}));

/**
 * Snapshot of the WS status for non-reactive callers. Components should prefer
 * subscribing via `useChainStore` selectors (e.g. ConnectionBadge).
 */
export function getWsStatus(): {
  status: WsStatus;
  connected: boolean;
  lastMessageAt: number | null;
} {
  const s = useChainStore.getState();
  return {
    status: s.status,
    connected: s.connected,
    lastMessageAt: s.lastMessageAt,
  };
}

// ---------------------------------------------------------------------------
// Singleton WebSocket with RAF-batched flush.
// ---------------------------------------------------------------------------
type SubMsg =
  | { sub: "option_chain"; underlying: string; expiry: string }
  | { sub: "candles"; underlying: string }
  | { sub: "paper_position"; id: number }
  | { sub: "live_positions" }
  | { sub: "live_strategy"; id: number };

type UnsubMsg = { unsub: string; id?: number; underlying?: string; expiry?: string };

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
  let url = `${proto}//${window.location.host}/ws`;
  // VITE_API_TOKEN: optional bearer token for a gated prod backend. When set,
  // append it as a query param (WS can't carry an Authorization header). Unset
  // in dev -> no token, backend is permissive.
  const token = import.meta.env.VITE_API_TOKEN as string | undefined;
  if (token) url += `?token=${encodeURIComponent(token)}`;
  return url;
}

function startFlushLoop(): void {
  if (rafId !== null || !hasWindow()) return;
  const tick = (): void => {
    if (queue.length) {
      const batch = queue;
      queue = [];
      useChainStore.getState()._applyBatch(batch);
      if (
        paperListeners.size ||
        livePositionsListeners.size ||
        liveStrategyListeners.size
      ) {
        for (const f of batch) {
          if (f.ch === "paper_position") {
            const pf = f as PaperPositionFrame;
            for (const fn of paperListeners) fn(pf);
          } else if (f.ch === "live_positions") {
            const lf = f as LivePositionsFrame;
            for (const fn of livePositionsListeners) fn(lf);
          } else if (f.ch === "live_strategy") {
            const sf = f as LiveStrategyFrame;
            for (const fn of liveStrategyListeners) fn(sf);
          }
        }
      }
    }
    rafId = requestAnimationFrame(tick);
  };
  rafId = requestAnimationFrame(tick);
}

function send(msg: SubMsg | UnsubMsg): void {
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
    // We have subscriptions we intend to keep -> show "reconnecting", not a
    // bare "disconnected", while the backoff timer is pending.
    useChainStore.getState()._setStatus("reconnecting");
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

export function subscribePaperPosition(id: number): void {
  if (!hasWindow()) return;
  const key = `paper_position:${id}`;
  desiredSubs.set(key, { sub: "paper_position", id });
  ensureSocket();
  send({ sub: "paper_position", id });
}

export function unsubscribePaperPosition(id: number): void {
  desiredSubs.delete(`paper_position:${id}`);
  // Tell the hub to stop polling/pushing this id (it supports unsub); also keeps
  // it from being replayed on reconnect.
  send({ unsub: "paper_position", id });
}

// --- Live monitor topics (ADR 0004 §9) ------------------------------------
export function subscribeLivePositions(): void {
  if (!hasWindow()) return;
  desiredSubs.set("live_positions", { sub: "live_positions" });
  ensureSocket();
  send({ sub: "live_positions" });
}

export function unsubscribeLivePositions(): void {
  desiredSubs.delete("live_positions");
  send({ unsub: "live_positions" });
}

export function subscribeLiveStrategy(id: number): void {
  if (!hasWindow()) return;
  desiredSubs.set(`live_strategy:${id}`, { sub: "live_strategy", id });
  ensureSocket();
  send({ sub: "live_strategy", id });
}

export function unsubscribeLiveStrategy(id: number): void {
  desiredSubs.delete(`live_strategy:${id}`);
  send({ unsub: "live_strategy", id });
}
