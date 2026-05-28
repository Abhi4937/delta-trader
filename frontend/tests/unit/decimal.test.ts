import { describe, expect, it } from "vitest";
import { fmt, toDecimal } from "../../src/lib/decimal";

describe("toDecimal", () => {
  it("parses Decimal-as-string", () => {
    expect(toDecimal("1234.50")?.toString()).toBe("1234.5");
  });

  it("parses numbers", () => {
    expect(toDecimal(42)?.toNumber()).toBe(42);
  });

  it("returns null for null / undefined / empty", () => {
    expect(toDecimal(null)).toBeNull();
    expect(toDecimal(undefined)).toBeNull();
    expect(toDecimal("")).toBeNull();
    expect(toDecimal("   ")).toBeNull();
  });

  it("returns null for unparseable values", () => {
    expect(toDecimal("not-a-number")).toBeNull();
  });
});

describe("fmt", () => {
  it("formats with fixed decimal places", () => {
    expect(fmt("1234.5", 2)).toBe("1234.50");
    expect(fmt("0.6234", 4)).toBe("0.6234");
  });

  it("defaults to 2 decimal places", () => {
    expect(fmt("1.005")).toBe("1.01");
  });

  it("renders em-dash for null / undefined / empty", () => {
    expect(fmt(null)).toBe("—");
    expect(fmt(undefined)).toBe("—");
    expect(fmt("")).toBe("—");
  });
});
