import { describe, expect, it } from "vitest";
import { parseSymbol } from "../../src/lib/symbols";

describe("parseSymbol", () => {
  it("parses a call symbol", () => {
    expect(parseSymbol("C-BTC-90000-290526")).toEqual({
      side: "C",
      strike: 90000,
      expiry: "290526",
    });
  });

  it("parses a put symbol", () => {
    expect(parseSymbol("P-BTC-87500-290526")).toEqual({
      side: "P",
      strike: 87500,
      expiry: "290526",
    });
  });

  it("returns null for null / undefined / empty", () => {
    expect(parseSymbol(null)).toBeNull();
    expect(parseSymbol(undefined)).toBeNull();
    expect(parseSymbol("")).toBeNull();
  });

  it("returns null for non-option sides", () => {
    expect(parseSymbol("X-BTC-90000-290526")).toBeNull();
  });

  it("returns null for malformed symbols", () => {
    expect(parseSymbol("C-BTC")).toBeNull();
    expect(parseSymbol("C-BTC-notanumber-290526")).toBeNull();
  });
});
