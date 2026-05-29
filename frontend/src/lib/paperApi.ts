// Typed REST client for the Phase 2 paper-trade engine (ADR 0003 §10).
// Hits the Vite proxy at /api/... -> FastAPI :8001. All numeric fields are
// Decimal-as-strings on the wire — never parsed to float here.

import { authHeaders } from "./api";

const API_BASE = "/api";

// ---------------------------------------------------------------------------
// Request DTOs
// ---------------------------------------------------------------------------
export interface LegSpec {
  symbol: string;
  side: "buy" | "sell";
  /** contracts, > 0; serialized as a string */
  qty: string;
}

export interface StrategySpec {
  name: string;
  underlying: string;
  legs: LegSpec[];
  atomic?: boolean;
  note?: string | null;
}

// ---------------------------------------------------------------------------
// Response DTOs (numeric fields are strings)
// ---------------------------------------------------------------------------
export interface PreviewLeg {
  symbol: string;
  side: "buy" | "sell";
  qty: string;
  contract_size: string;
  vwap: string;
  impact: string;
  entry_fill: string;
}

export interface Preview {
  entry_cost: string;
  margin_estimate: string;
  legs: PreviewLeg[];
}

export interface PreviewResponse {
  strategy_id: number;
  preview: Preview;
}

export type PositionStatus = "open" | "partially_closed" | "closed";
export type LegStatus = "open" | "partially_closed" | "closed";

export interface PaperLeg {
  id: number;
  symbol: string;
  side: "buy" | "sell";
  qty: string;
  qty_open: string;
  contract_size: string;
  entry_fill: string;
  exit_fill: string | null;
  status: LegStatus;
}

/** MTM snapshot. `mark_stale` arrives as boolean (WS) or "true"/"false" (REST hash). */
export interface Mtm {
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

export interface PaperPosition {
  id: number;
  strategy_id: number;
  underlying: string;
  status: PositionStatus;
  opened_at: string;
  closed_at: string | null;
  entry_cost: string;
  realized_pnl: string;
  margin_estimate: string;
  flags: Record<string, unknown>;
  legs: PaperLeg[];
  mtm: Mtm | null;
}

export interface CloseResult extends PaperPosition {
  close: { status: PositionStatus; realized_pnl: string };
}

export interface Strategy {
  id: number;
  name: string;
  underlying: string;
  spec: StrategySpec;
  created_at: string;
}

export interface MtmHistory {
  position_id: number;
  latest: Mtm | null;
  rv: {
    intraday: string | null;
    historical: string | null;
    window_minutes: string | number;
    window_days: string | number;
  };
  curve: Array<{
    ts: string;
    total_pnl: string;
    unrealized_pnl: string;
    realized_pnl: string;
    net_delta: string;
    net_theta: string;
    strategy_iv: string;
  }>;
}

export interface CloseLeg {
  leg_id: number;
  qty: string;
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/** Thrown on HTTP 409 insufficient_depth from preview/execute/close. */
export class InsufficientDepthError extends Error {
  readonly symbol?: string;
  constructor(msg: string, symbol?: string) {
    super(msg);
    this.name = "InsufficientDepthError";
    this.symbol = symbol;
  }
}

interface ErrorDetail {
  error?: string;
  msg?: string;
  symbol?: string;
}

async function parseError(res: Response, path: string): Promise<never> {
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    /* non-JSON body */
  }
  if (res.status === 409) {
    const detail = (body as { detail?: ErrorDetail } | null)?.detail;
    const d: ErrorDetail =
      detail && typeof detail === "object" ? detail : (body as ErrorDetail) ?? {};
    if (d.error === "insufficient_depth" || res.status === 409) {
      throw new InsufficientDepthError(
        d.msg ?? "Insufficient orderbook depth to fill this order.",
        d.symbol,
      );
    }
  }
  const detailMsg =
    (body as { detail?: unknown } | null)?.detail ?? res.statusText;
  throw new Error(
    `${path} failed: ${res.status} ${
      typeof detailMsg === "string" ? detailMsg : JSON.stringify(detailMsg)
    }`,
  );
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

async function getJSON<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: authHeaders(),
  });
  if (!res.ok) return parseError(res, `GET ${path}`);
  return (await res.json()) as T;
}

// ---------------------------------------------------------------------------
// Public client functions
// ---------------------------------------------------------------------------

/** Persists the strategy and returns the authoritative entry preview. */
export function previewStrategy(spec: StrategySpec): Promise<PreviewResponse> {
  return postJSON<PreviewResponse>("/paper/strategies", spec);
}

/** Execute: pass either a saved strategy_id or an inline spec. */
export function executeStrategy(
  arg: { strategy_id: number } | { spec: StrategySpec },
): Promise<PaperPosition> {
  return postJSON<PaperPosition>("/paper/strategies/execute", arg);
}

export async function listPositions(
  status?: PositionStatus,
): Promise<PaperPosition[]> {
  const q = status ? `?status=${encodeURIComponent(status)}` : "";
  const res = await getJSON<{ positions: PaperPosition[] }>(
    `/paper/positions${q}`,
  );
  return res.positions;
}

export function closePosition(
  id: number,
  legs?: CloseLeg[],
): Promise<CloseResult> {
  return postJSON<CloseResult>(
    `/paper/positions/${id}/close`,
    legs && legs.length > 0 ? { legs } : {},
  );
}

export function getPositionMtm(
  id: number,
  history = false,
): Promise<MtmHistory> {
  const q = history ? "?history=true" : "";
  return getJSON<MtmHistory>(`/paper/positions/${id}/mtm${q}`);
}

export async function listStrategies(): Promise<Strategy[]> {
  const res = await getJSON<{ strategies: Strategy[] }>("/paper/strategies");
  return res.strategies;
}

/** Normalize a `mark_stale` field (bool or "true"/"false") to boolean. */
export function isStale(v: boolean | string | undefined | null): boolean {
  return v === true || v === "true";
}
