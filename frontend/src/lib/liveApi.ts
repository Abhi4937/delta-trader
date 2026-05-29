// Typed REST client for the Phase 3 live monitor (ADR 0004 §9).
// Hits the Vite proxy at /api/live/... -> FastAPI :8001. All numeric fields are
// Decimal-as-strings on the wire — never parsed to float here.
//
// PARANOID mode: /live/* returns 503 (auth_not_configured) when Delta API keys
// are absent. Order-placing paths (stop-loss arm/disarm) are double-gated and
// can also return 403 (live_trading_disabled) / 422 (confirmation/threshold).

import { authHeaders } from "./api";

const API_BASE = "/api";

// ---------------------------------------------------------------------------
// Response DTOs (numeric fields are strings)
// ---------------------------------------------------------------------------
export interface LivePosition {
  symbol: string;
  size: string; // SIGNED contracts (+long / -short)
  entry_price: string;
  mark_price: string;
  contract_size: string;
  margin: string;
  unrealized: string;
  product_id: number | string;
}

export interface LiveOrder {
  id: number | string;
  symbol: string;
  side: "buy" | "sell";
  size: string;
  state: string;
}

export type SlState =
  | null
  | "ARMED"
  | "TRIGGERED"
  | "CLOSING"
  | "CLOSED"
  | "FAILED";

export interface StrategyAggregate {
  total_pnl: string;
  unrealized_pnl: string;
  net_delta: string;
  net_gamma: string;
  net_theta: string;
  net_vega: string;
  strategy_iv: string;
  margin: string;
  mark_stale: boolean | string;
}

export interface LiveStrategy {
  id: number;
  name: string;
  created_at: string;
  symbols: string[];
  aggregate: StrategyAggregate;
  sl_state: SlState;
}

export interface StrategyMtm {
  strategy_id: number;
  aggregate: StrategyAggregate;
  rv: {
    intraday: string | null;
    historical: string | null;
    window_minutes: string | number;
  };
  sl_state: SlState;
  curve: Array<{
    ts: string;
    total_pnl: string;
    unrealized_pnl: string;
    net_delta: string;
    net_theta: string;
    strategy_iv: string;
  }>;
}

export interface CreateStrategyResult {
  strategy_id: number;
}

export interface StopLossResult {
  strategy_id?: number;
  sl_state: SlState | "DISARMED";
}

export interface StopLossSpec {
  threshold_abs?: string;
  threshold_pct?: string;
  confirm: boolean;
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/** Thrown on HTTP 503 — Delta API keys are not configured. */
export class NotConfiguredError extends Error {
  constructor(msg = "Live trading not configured — add Delta API keys") {
    super(msg);
    this.name = "NotConfiguredError";
  }
}

/** Thrown on HTTP 403 — live_trading_enabled is false. */
export class LiveTradingDisabledError extends Error {
  constructor(msg = "Live trading is disabled — enable live trading") {
    super(msg);
    this.name = "LiveTradingDisabledError";
  }
}

/** Thrown on HTTP 409 — e.g. a position is already tagged into a strategy. */
export class ConflictError extends Error {
  readonly code?: string;
  constructor(msg: string, code?: string) {
    super(msg);
    this.name = "ConflictError";
    this.code = code;
  }
}

interface ErrorDetail {
  error?: string;
  msg?: string;
}

function detailOf(body: unknown): ErrorDetail {
  const detail = (body as { detail?: unknown } | null)?.detail;
  if (detail && typeof detail === "object") return detail as ErrorDetail;
  return {};
}

async function parseError(res: Response, path: string): Promise<never> {
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    /* non-JSON body */
  }
  const d = detailOf(body);

  if (res.status === 503) {
    throw new NotConfiguredError();
  }
  if (res.status === 403) {
    throw new LiveTradingDisabledError(d.msg ?? undefined);
  }
  if (res.status === 409) {
    if (d.error === "already_tagged") {
      throw new ConflictError(
        d.msg ?? "One or more positions are already in a strategy.",
        d.error,
      );
    }
    throw new ConflictError(d.msg ?? "Conflict.", d.error);
  }
  if (res.status === 422) {
    throw new Error(
      `${path} failed: ${d.msg ?? d.error ?? "Validation error (422)."}`,
    );
  }

  const detailMsg =
    (body as { detail?: unknown } | null)?.detail ?? res.statusText;
  throw new Error(
    `${path} failed: ${res.status} ${
      typeof detailMsg === "string" ? detailMsg : JSON.stringify(detailMsg)
    }`,
  );
}

async function getJSON<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: authHeaders(),
  });
  if (!res.ok) return parseError(res, `GET ${path}`);
  return (await res.json()) as T;
}

async function postJSON<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(body),
  });
  if (!res.ok) return parseError(res, `POST ${path}`);
  return (await res.json()) as T;
}

async function deleteJSON<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  if (!res.ok) return parseError(res, `DELETE ${path}`);
  return (await res.json()) as T;
}

// ---------------------------------------------------------------------------
// Public client functions
// ---------------------------------------------------------------------------

export async function getLivePositions(): Promise<LivePosition[]> {
  const res = await getJSON<{ positions: LivePosition[] }>("/live/positions");
  return res.positions;
}

export async function getLiveOrders(): Promise<LiveOrder[]> {
  const res = await getJSON<{ orders: LiveOrder[] }>("/live/orders");
  return res.orders;
}

/** Tag positions into a named strategy. 409 if a position is already tagged. */
export function createLiveStrategy(
  name: string,
  symbols: string[],
): Promise<CreateStrategyResult> {
  return postJSON<CreateStrategyResult>("/live/strategies", {
    name,
    position_ids: symbols,
  });
}

export async function listLiveStrategies(): Promise<LiveStrategy[]> {
  const res = await getJSON<{ strategies: LiveStrategy[] }>("/live/strategies");
  return res.strategies;
}

export function getLiveStrategyMtm(
  id: number,
  history = false,
): Promise<StrategyMtm> {
  const q = history ? "?history=true" : "";
  return getJSON<StrategyMtm>(`/live/strategies/${id}/mtm${q}`);
}

/** Arm a whole-strategy stop-loss. Double-gated: requires confirm:true. */
export function setStopLoss(
  id: number,
  spec: StopLossSpec,
): Promise<StopLossResult> {
  return postJSON<StopLossResult>(`/live/strategies/${id}/stop-loss`, spec);
}

/** Disarm a stop-loss (only while ARMED). 409 if not ARMED. */
export function clearStopLoss(id: number): Promise<StopLossResult> {
  return deleteJSON<StopLossResult>(`/live/strategies/${id}/stop-loss`);
}

/** Normalize a `mark_stale` field (bool or "true"/"false") to boolean. */
export function isStale(v: boolean | string | undefined | null): boolean {
  return v === true || v === "true";
}
