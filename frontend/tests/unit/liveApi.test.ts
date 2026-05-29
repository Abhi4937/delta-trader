import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ConflictError,
  createLiveStrategy,
  getLivePositions,
  LiveTradingDisabledError,
  NotConfiguredError,
  setStopLoss,
} from "../../src/lib/liveApi";

function mockFetch(status: number, body: unknown): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: status >= 200 && status < 300,
      status,
      statusText: `HTTP ${status}`,
      json: async () => body,
    })),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("liveApi error mapping", () => {
  it("maps 503 -> NotConfiguredError on a read", async () => {
    mockFetch(503, { detail: { error: "auth_not_configured" } });
    await expect(getLivePositions()).rejects.toBeInstanceOf(NotConfiguredError);
  });

  it("maps 403 -> LiveTradingDisabledError on stop-loss", async () => {
    mockFetch(403, { detail: { error: "live_trading_disabled" } });
    await expect(
      setStopLoss(1, { threshold_abs: "500", confirm: true }),
    ).rejects.toBeInstanceOf(LiveTradingDisabledError);
  });

  it("maps 409 already_tagged -> ConflictError on create", async () => {
    mockFetch(409, { detail: { error: "already_tagged" } });
    await expect(
      createLiveStrategy("S", ["C-BTC-90000-310125"]),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("surfaces a 422 message", async () => {
    mockFetch(422, { detail: { error: "threshold_required" } });
    await expect(
      setStopLoss(1, { confirm: true }),
    ).rejects.toThrow(/threshold_required/);
  });

  it("returns parsed positions on 200", async () => {
    mockFetch(200, {
      positions: [
        {
          symbol: "C-BTC-90000-310125",
          size: "3",
          entry_price: "100",
          mark_price: "120",
          contract_size: "0.001",
          margin: "50",
          unrealized: "60",
          product_id: 27,
        },
      ],
    });
    const positions = await getLivePositions();
    expect(positions).toHaveLength(1);
    expect(positions[0].symbol).toBe("C-BTC-90000-310125");
  });
});
