// Typed reader for the per-position/strategy timeseries endpoints (ADR 0005 §2).
//   GET /paper/positions/{id}/timeseries?fields=...&from=&to=
//   GET /live/strategies/{id}/timeseries?fields=...&from=&to=   (503 w/o keys)
// Returns a tidy frame `{fields, points:[{ts, <field>:str|null}]}`. All numeric
// fields are Decimal-as-strings (or null) on the wire — never floats.

import { authHeaders } from "./api";

const API_BASE = "/api";

export type TimeseriesField =
  | "close"
  | "delta"
  | "gamma"
  | "theta"
  | "vega"
  | "iv"
  | "rv_intraday"
  | "rv_historical";

export interface TimeseriesPoint {
  ts: string;
  close?: string | null;
  delta?: string | null;
  gamma?: string | null;
  theta?: string | null;
  vega?: string | null;
  iv?: string | null;
  rv_intraday?: string | null;
  rv_historical?: string | null;
}

export interface TimeseriesResponse {
  fields: string[];
  points: TimeseriesPoint[];
}

/** Thrown on HTTP 503 — Delta API keys are not configured (live only). */
export class TimeseriesNotConfiguredError extends Error {
  constructor(msg = "Live timeseries not configured — add Delta API keys") {
    super(msg);
    this.name = "TimeseriesNotConfiguredError";
  }
}

const DEFAULT_FIELDS: TimeseriesField[] = [
  "close",
  "delta",
  "gamma",
  "theta",
  "vega",
  "iv",
  "rv_intraday",
  "rv_historical",
];

async function getJSON<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: authHeaders(),
  });
  if (res.status === 503) throw new TimeseriesNotConfiguredError();
  if (!res.ok) {
    throw new Error(`GET ${path} failed: ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as T;
}

function query(
  fields: TimeseriesField[],
  from?: number,
  to?: number,
): string {
  const parts = [`fields=${fields.join(",")}`];
  if (from !== undefined) parts.push(`from=${Math.floor(from)}`);
  if (to !== undefined) parts.push(`to=${Math.floor(to)}`);
  return parts.join("&");
}

export function getPaperTimeseries(
  positionId: number,
  fields: TimeseriesField[] = DEFAULT_FIELDS,
  from?: number,
  to?: number,
): Promise<TimeseriesResponse> {
  return getJSON<TimeseriesResponse>(
    `/paper/positions/${positionId}/timeseries?${query(fields, from, to)}`,
  );
}

export function getLiveTimeseries(
  strategyId: number,
  fields: TimeseriesField[] = DEFAULT_FIELDS,
  from?: number,
  to?: number,
): Promise<TimeseriesResponse> {
  return getJSON<TimeseriesResponse>(
    `/live/strategies/${strategyId}/timeseries?${query(fields, from, to)}`,
  );
}

/** Source discriminator so the chart components stay generic over paper/live. */
export type TimeseriesSource =
  | { kind: "paper"; id: number }
  | { kind: "live"; id: number };

export function getTimeseries(
  source: TimeseriesSource,
  fields?: TimeseriesField[],
  from?: number,
  to?: number,
): Promise<TimeseriesResponse> {
  return source.kind === "paper"
    ? getPaperTimeseries(source.id, fields, from, to)
    : getLiveTimeseries(source.id, fields, from, to);
}
