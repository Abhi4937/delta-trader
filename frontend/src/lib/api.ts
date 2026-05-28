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

const API_BASE = "/api";

async function getJSON<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { Accept: "application/json" },
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
