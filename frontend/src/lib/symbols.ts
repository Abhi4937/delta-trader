export type OptionSide = "C" | "P";

export interface ParsedSymbol {
  side: OptionSide;
  strike: number;
  /** Expiry date tail as it appears on the wire (e.g. "290526"). */
  expiry: string;
}

/**
 * Parse a Delta option symbol like `C-BTC-90000-290526` (call) or
 * `P-BTC-90000-290526` (put). The number before the date tail is the strike.
 * Returns null for anything that does not match the expected shape.
 */
export function parseSymbol(sym: string | null | undefined): ParsedSymbol | null {
  if (!sym) return null;
  const parts = sym.split("-");
  if (parts.length < 4) return null;

  const sideRaw = parts[0]?.toUpperCase();
  if (sideRaw !== "C" && sideRaw !== "P") return null;

  // strike is the second-to-last segment, date tail is the last segment.
  const expiry = parts[parts.length - 1];
  const strikeRaw = parts[parts.length - 2];
  const strike = Number(strikeRaw);
  if (!expiry || !Number.isFinite(strike)) return null;

  return { side: sideRaw, strike, expiry };
}
