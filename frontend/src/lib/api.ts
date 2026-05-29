// Typed REST wrapper. Hits the Vite proxy at /api/... which strips the prefix
// before reaching the FastAPI backend on :8001.

export interface Expiry {
  /** "DD-MM-YYYY" */
  expiry_code: string;
  expiry_ts: string;
}

export interface ExpiriesResponse {
  underlying: string;
  expiries: Expiry[];
}

/** All numeric fields arrive as Decimal-as-string (or null). Never floats. */
export interface OptionRow {
  symbol: string;
  mark_price: string | null;
  iv: string | null;
  delta: string | null;
  gamma: string | null;
  theta: string | null;
  vega: string | null;
  oi: string | null;
  best_bid: string | null;
  best_ask: string | null;
}

export interface OptionChainResponse {
  underlying: string;
  expiry: string;
  source: string;
  rows: OptionRow[];
}

/**
 * Raw spot/premium candle from `/spot/candles`. Numeric fields may arrive as
 * Decimal-as-string OR plain JSON number depending on the cache path — callers
 * normalize via `toDecimal`. `time` is unix seconds.
 */
export interface RawCandle {
  time: number;
  open: string | number;
  high: string | number;
  low: string | number;
  close: string | number;
  volume?: string | number;
}

export interface CandlesResponse {
  symbol: string;
  resolution: string;
  candles: RawCandle[];
  cached?: boolean;
}

const API_BASE = "/api";

/**
 * Shared request headers. VITE_API_TOKEN is an optional bearer token for a
 * gated prod backend; when set we send `Authorization: Bearer <token>` on every
 * REST call. Unset in dev -> no header, backend is permissive.
 */
export function authHeaders(extra?: Record<string, string>): HeadersInit {
  const headers: Record<string, string> = { Accept: "application/json", ...extra };
  const token = import.meta.env.VITE_API_TOKEN as string | undefined;
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

async function getJSON<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: authHeaders(),
  });
  if (!res.ok) {
    throw new Error(`GET ${path} failed: ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as T;
}

export function getExpiries(underlying: string): Promise<ExpiriesResponse> {
  return getJSON<ExpiriesResponse>(
    `/expiries?underlying=${encodeURIComponent(underlying)}`,
  );
}

export function getOptionChain(
  underlying: string,
  expiry: string,
): Promise<OptionChainResponse> {
  return getJSON<OptionChainResponse>(
    `/option-chain?underlying=${encodeURIComponent(underlying)}&expiry=${encodeURIComponent(expiry)}`,
  );
}

/**
 * Fetch candles for a spot symbol (e.g. "BTCUSD") or an option symbol (its
 * premium history). `start`/`end` are unix seconds.
 */
export function getCandles(
  symbol: string,
  resolution: string,
  start: number,
  end: number,
): Promise<CandlesResponse> {
  return getJSON<CandlesResponse>(
    `/spot/candles?symbol=${encodeURIComponent(symbol)}&resolution=${encodeURIComponent(
      resolution,
    )}&start=${Math.floor(start)}&end=${Math.floor(end)}`,
  );
}
