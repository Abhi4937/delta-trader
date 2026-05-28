import { Decimal } from "decimal.js";

// Money & greeks are Decimal end-to-end (hard rule #3). 30 significant digits
// is comfortably more than any price/greek we transport as a string.
Decimal.set({ precision: 30 });

export { Decimal };

/**
 * Parse a wire value (Decimal-as-string, number, null, undefined) into a
 * Decimal. Returns null for missing / unparseable / non-finite values so
 * callers can render an em-dash instead of NaN.
 */
export function toDecimal(v: string | number | null | undefined): Decimal | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "string" && v.trim() === "") return null;
  try {
    const d = new Decimal(v);
    return d.isFinite() ? d : null;
  } catch {
    return null;
  }
}

/**
 * Format a wire value as a fixed-decimal string for display.
 * Null / undefined / unparseable -> "—".
 */
export function fmt(v: string | number | null | undefined, dp = 2): string {
  const d = toDecimal(v);
  if (d === null) return "—";
  return d.toFixed(dp);
}
