import { expect, test, type Page } from "@playwright/test";

// E2E for the Live Monitor (Section 2 — REAL MONEY). All /api/live/* responses
// are MOCKED via page.route so this test is independent of Delta API keys
// (which are NOT configured in dev; the real endpoints would 503). The
// orchestrator runs this — do NOT run locally.

const POSITIONS = {
  positions: [
    {
      symbol: "C-BTC-90000-310125",
      size: "3",
      entry_price: "120.5",
      mark_price: "150.0",
      contract_size: "0.001",
      margin: "500.00",
      unrealized: "88.50",
      product_id: 27,
    },
    {
      symbol: "P-BTC-80000-310125",
      size: "-2",
      entry_price: "95.0",
      mark_price: "70.0",
      contract_size: "0.001",
      margin: "300.00",
      unrealized: "50.00",
      product_id: 31,
    },
  ],
};

const AGGREGATE = {
  total_pnl: "138.50",
  unrealized_pnl: "138.50",
  net_delta: "-0.12",
  net_gamma: "0.0003",
  net_theta: "22.4",
  net_vega: "-15.1",
  strategy_iv: "0.58",
  margin: "800.00",
  mark_stale: false,
};

function strategy(slState: string | null) {
  return {
    id: 7,
    name: "My Spread",
    created_at: "2026-05-29T10:00:00Z",
    symbols: ["C-BTC-90000-310125", "P-BTC-80000-310125"],
    aggregate: AGGREGATE,
    sl_state: slState,
  };
}

test("live monitor: banner, positions, grouping, SL confirm gate, triggered badge", async ({
  page,
}: {
  page: Page;
}) => {
  // Mutable mock state driven by the test steps.
  let strategyCreated = false;
  let slState: string | null = null;

  // --- Mock all /api/live/* endpoints --------------------------------------
  await page.route("**/api/live/positions", async (route) => {
    await route.fulfill({ json: POSITIONS });
  });

  await page.route("**/api/live/orders", async (route) => {
    await route.fulfill({ json: { orders: [] } });
  });

  await page.route("**/api/live/strategies", async (route) => {
    if (route.request().method() === "POST") {
      strategyCreated = true;
      await route.fulfill({ json: { strategy_id: 7 } });
      return;
    }
    // GET: empty until created, then the tagged strategy with current SL state.
    await route.fulfill({
      json: { strategies: strategyCreated ? [strategy(slState)] : [] },
    });
  });

  await page.route("**/api/live/strategies/*/mtm*", async (route) => {
    await route.fulfill({
      json: {
        strategy_id: 7,
        aggregate: AGGREGATE,
        rv: { intraday: "0.41", historical: "0.39", window_minutes: 30 },
        sl_state: slState,
        curve: [
          {
            ts: "2026-05-29T10:00:00Z",
            total_pnl: "100.00",
            unrealized_pnl: "100.00",
            net_delta: "-0.1",
            net_theta: "20",
            strategy_iv: "0.55",
          },
          {
            ts: "2026-05-29T10:00:01Z",
            total_pnl: "138.50",
            unrealized_pnl: "138.50",
            net_delta: "-0.12",
            net_theta: "22.4",
            strategy_iv: "0.58",
          },
        ],
      },
    });
  });

  await page.route("**/api/live/strategies/*/stop-loss", async (route) => {
    if (route.request().method() === "POST") {
      slState = "ARMED";
      await route.fulfill({ json: { strategy_id: 7, sl_state: "ARMED" } });
      return;
    }
    slState = null;
    await route.fulfill({ json: { sl_state: "DISARMED" } });
  });

  await page.goto("/");

  // Switch to the Live Monitor tab.
  await page.getByTestId("tab-live").click();

  // (banner) The prominent REAL MONEY marker is present.
  const banner = page.getByTestId("live-banner");
  await expect(banner).toBeVisible();
  await expect(banner).toContainText(/REAL MONEY/i);

  // (a) positions render.
  await expect(page.getByTestId("live-positions-table")).toBeVisible();
  await expect(page.getByTestId("live-position-row")).toHaveCount(2);

  // (b) grouping works: select positions, name, create -> it appears.
  const checkboxes = page.getByTestId("grouper-checkbox");
  await checkboxes.nth(0).check();
  await checkboxes.nth(1).check();
  await page.getByTestId("strategy-name-input").fill("My Spread");
  await page.getByTestId("create-strategy-btn").click();

  const strategyRow = page.getByTestId("live-strategy-row");
  await expect(strategyRow).toHaveCount(1, { timeout: 10_000 });
  await expect(strategyRow).toContainText("My Spread");

  // Open the strategy detail.
  await strategyRow.click();
  await expect(page.getByTestId("live-strategy-detail")).toBeVisible();

  // (c) arming SL requires the confirmation checkbox.
  await page.getByTestId("open-sl-dialog-btn").click();
  await expect(page.getByTestId("sl-dialog")).toBeVisible();

  const confirmBtn = page.getByTestId("sl-confirm-btn");
  await page.getByTestId("sl-threshold-abs").fill("500");
  await expect(confirmBtn).toBeDisabled();

  await page.getByTestId("sl-understand-checkbox").check();
  await expect(confirmBtn).toBeEnabled();

  await confirmBtn.click();

  // SL badge in the strategy row now shows ARMED (from the GET poll).
  await expect(page.getByTestId("live-strategy-row").getByTestId("sl-badge")).toContainText(
    /ARMED/,
    { timeout: 10_000 },
  );

  // (d) when the backend returns a TRIGGERED state, the SL badge updates.
  slState = "TRIGGERED";
  await expect(page.getByTestId("live-strategy-row").getByTestId("sl-badge")).toContainText(
    /TRIGGERED/,
    { timeout: 10_000 },
  );
});
