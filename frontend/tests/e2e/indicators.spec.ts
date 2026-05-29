import { expect, test, type Page } from "@playwright/test";

// E2E against the live Phase 4 stack (orchestrator runs this; do NOT run locally).
//
// Flow:
//  1. Open app -> ensure nearest BTC expiry selected -> open the Spot chart and
//     toggle indicators (RSI oscillator subpane, EMA overlays).
//  2. Execute a paper short straddle (reusing the paper-trade pattern) so a
//     position exists, open its detail, and verify the Greeks + IV/RV tabs.

// --- helpers ---------------------------------------------------------------

/** Build + execute an ATM short straddle, returns the new position id. */
async function executeStraddle(page: Page): Promise<string> {
  await page.getByTestId("tab-trade").click();
  await expect(page.getByTestId("strategy-builder")).toBeVisible();

  const addLeg = page.getByTestId("add-leg-btn");
  await addLeg.click();
  await addLeg.click();

  const legRows = page.getByTestId("builder-leg-row");
  await expect(legRows).toHaveCount(2);

  const strike0 = legRows.nth(0).getByTestId("leg-strike");
  const strikeOptions = strike0.locator("option");
  const optionCount = await strikeOptions.count();
  const midIndex = Math.max(1, Math.floor(optionCount / 2));
  const midStrike = await strikeOptions.nth(midIndex).getAttribute("value");

  await legRows.nth(0).getByTestId("leg-side").selectOption("sell");
  await strike0.selectOption(midStrike as string);
  await legRows.nth(0).getByTestId("leg-right").selectOption("C");

  await legRows.nth(1).getByTestId("leg-side").selectOption("sell");
  await legRows.nth(1).getByTestId("leg-strike").selectOption(midStrike as string);
  await legRows.nth(1).getByTestId("leg-right").selectOption("P");

  await page.getByTestId("preview-strategy-btn").click();
  await expect(page.getByTestId("strategy-preview-modal")).toBeVisible();
  await page.getByTestId("execute-paper-btn").click();

  const positionRow = page.getByTestId("paper-position-row").first();
  await expect(positionRow).toBeVisible({ timeout: 15_000 });
  const posId = await positionRow.getAttribute("data-position-id");
  expect(posId).toBeTruthy();
  return posId as string;
}

// --- tests -----------------------------------------------------------------

test("spot chart: toggle RSI oscillator and EMA overlays", async ({ page }) => {
  await page.goto("/");

  const expirySelect = page.getByLabel("Select expiry");
  await expect(expirySelect).toBeEnabled();
  const firstExpiry = await expirySelect
    .locator("option")
    .first()
    .getAttribute("value");
  if (firstExpiry) await expirySelect.selectOption(firstExpiry);

  // The option-chain tab shows the spot chart + indicator panel.
  await expect(page.getByTestId("spot-chart")).toBeVisible();
  await expect(page.getByTestId("indicator-panel")).toBeVisible();

  // ADX is on by default -> its oscillator subpane is present.
  await expect(page.getByTestId("osc-adx")).toBeVisible();

  // Toggle RSI on -> an RSI oscillator subpane appears with a canvas.
  await page.getByTestId("ind-toggle-rsi").check();
  const rsiPane = page.getByTestId("osc-rsi");
  await expect(rsiPane).toBeVisible();
  await expect(rsiPane.locator("canvas").first()).toBeVisible();

  // Toggle EMA(20)+EMA(50) overlays on -> main pane still renders a canvas.
  await page.getByTestId("ind-toggle-ema").check();
  await expect(page.getByTestId("ind-ema-period-0")).toHaveValue("20");
  await expect(page.getByTestId("ind-ema-period-1")).toHaveValue("50");
  await expect(
    page.getByTestId("spot-chart-main").locator("canvas").first(),
  ).toBeVisible();
});

test("paper position detail: Greeks + IV/RV tabs render charts", async ({
  page,
}) => {
  await page.goto("/");

  const expirySelect = page.getByLabel("Select expiry");
  await expect(expirySelect).toBeEnabled();
  const firstExpiry = await expirySelect
    .locator("option")
    .first()
    .getAttribute("value");
  if (firstExpiry) await expirySelect.selectOption(firstExpiry);

  const posId = await executeStraddle(page);

  // Open the position detail.
  await page.getByTestId("paper-position-row").first().click();
  const detail = page.getByTestId("paper-position-detail");
  await expect(detail).toBeVisible();
  expect(await detail.getAttribute("data-position-id")).toBe(posId);

  // Tabs present.
  for (const t of [
    "detail-tab-overview",
    "detail-tab-pnl",
    "detail-tab-greeks",
    "detail-tab-ivrv",
    "detail-tab-spot",
  ]) {
    await expect(page.getByTestId(t)).toBeVisible();
  }

  // Greeks tab -> chart with 4 series (delta/gamma/theta/vega legend entries).
  await page.getByTestId("detail-tab-greeks").click();
  const greeks = page.getByTestId("greeks-chart");
  await expect(greeks).toBeVisible();
  // Recharts renders the 4 legend items once data arrives.
  await expect(async () => {
    const legendItems = greeks.locator(".recharts-legend-item");
    expect(await legendItems.count()).toBeGreaterThanOrEqual(4);
  }).toPass({ timeout: 15_000 });

  // IV/RV tab -> RV cards show + IV chart renders.
  await page.getByTestId("detail-tab-ivrv").click();
  await expect(page.getByTestId("iv-chart")).toBeVisible();
  const rvCards = page.getByTestId("rv-card");
  await expect(rvCards.first()).toBeVisible();
  expect(await rvCards.count()).toBeGreaterThanOrEqual(4);
  await expect(page.getByTestId("vol-cone")).toBeVisible();

  // Spot tab -> indicator-driven chart with the ADX subpane.
  await page.getByTestId("detail-tab-spot").click();
  await expect(page.getByTestId("spot-chart")).toBeVisible();
  await expect(page.getByTestId("osc-adx")).toBeVisible();
});
