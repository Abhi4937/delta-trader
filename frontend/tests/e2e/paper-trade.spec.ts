import { expect, test } from "@playwright/test";

// E2E against the live Phase 2 stack (orchestrator runs this; do NOT run locally).
// Flow: open app -> Paper Trade tab -> build a short straddle (sell ATM call +
// sell ATM put) -> Preview -> Execute -> verify MTM ticks -> Close.

test("paper trade: build, preview, execute, watch MTM, close a short straddle", async ({
  page,
}) => {
  await page.goto("/");

  // Ensure the nearest BTC expiry is selected (defaults to first ascending).
  const expirySelect = page.getByLabel("Select expiry");
  await expect(expirySelect).toBeEnabled();
  const firstExpiry = await expirySelect
    .locator("option")
    .first()
    .getAttribute("value");
  if (firstExpiry) await expirySelect.selectOption(firstExpiry);

  // Switch to the Paper Trade tab.
  await page.getByTestId("tab-trade").click();
  await expect(page.getByTestId("strategy-builder")).toBeVisible();

  // Add two legs.
  const addLeg = page.getByTestId("add-leg-btn");
  await addLeg.click();
  await addLeg.click();

  const legRows = page.getByTestId("builder-leg-row");
  await expect(legRows).toHaveCount(2);

  // Choose an ATM-ish strike: pick the middle strike option from the first
  // leg's strike select, then mirror it on the second leg.
  const strike0 = legRows.nth(0).getByTestId("leg-strike");
  const strikeOptions = strike0.locator("option");
  const optionCount = await strikeOptions.count();
  // option[0] is the "Strike…" placeholder; use the middle real strike.
  const midIndex = Math.max(1, Math.floor(optionCount / 2));
  const midStrike = await strikeOptions.nth(midIndex).getAttribute("value");
  expect(midStrike).toBeTruthy();

  // Leg 1: sell call at mid strike.
  await legRows.nth(0).getByTestId("leg-side").selectOption("sell");
  await strike0.selectOption(midStrike as string);
  await legRows.nth(0).getByTestId("leg-right").selectOption("C");

  // Leg 2: sell put at the same strike.
  await legRows.nth(1).getByTestId("leg-side").selectOption("sell");
  await legRows.nth(1).getByTestId("leg-strike").selectOption(midStrike as string);
  await legRows.nth(1).getByTestId("leg-right").selectOption("P");

  // Net delta footer should be near zero for an ATM straddle.
  const netDeltaFooter = page.getByTestId("net-delta-footer");
  await expect(netDeltaFooter).not.toHaveText("—");

  // Net theta should be positive for a short straddle (collect decay).
  const netThetaFooter = page.getByTestId("net-theta-footer");
  await expect(async () => {
    const t = parseFloat((await netThetaFooter.textContent()) ?? "0");
    expect(t).toBeGreaterThan(0);
  }).toPass({ timeout: 10_000 });

  // Open the preview modal.
  await page.getByTestId("preview-strategy-btn").click();
  await expect(page.getByTestId("strategy-preview-modal")).toBeVisible();

  // Margin estimate must be > 0.
  const marginText = await page
    .getByTestId("strategy-preview-margin")
    .textContent();
  expect(parseFloat(marginText ?? "0")).toBeGreaterThan(0);

  // Preview net delta near zero (ATM straddle).
  const previewDelta = parseFloat(
    (await page.getByTestId("strategy-preview-delta").textContent()) ?? "0",
  );
  expect(Math.abs(previewDelta)).toBeLessThan(0.1);

  // Execute the paper trade.
  await page.getByTestId("execute-paper-btn").click();

  // A position row should appear.
  const positionRow = page.getByTestId("paper-position-row").first();
  await expect(positionRow).toBeVisible({ timeout: 15_000 });

  // Resolve the position id and watch its live MTM cell tick.
  const posId = await positionRow.getAttribute("data-position-id");
  expect(posId).toBeTruthy();
  const mtmCell = page.getByTestId(`paper-mtm-${posId}`);

  // Liveness: the per-second MTM frame advances. A 1-lot BTC-option straddle has
  // sub-cent PnL that rounds to "0.00" on screen, so assert on the full-precision
  // live attributes (ts + raw total_pnl) which change every worker tick.
  const seen = new Set<string>();
  await expect(async () => {
    const ts = (await mtmCell.getAttribute("data-mtm-ts")) ?? "";
    const raw = (await mtmCell.getAttribute("data-total-pnl")) ?? "";
    if (ts) seen.add(`${ts}|${raw}`);
    expect(seen.size).toBeGreaterThanOrEqual(3);
  }).toPass({ timeout: 20_000, intervals: [400, 400, 400, 400] });

  // Close the position (button carries the same data-position-id).
  const closeBtn = page.locator(
    `[data-testid="close-position-btn"][data-position-id="${posId}"]`,
  );
  if ((await closeBtn.count()) > 0) {
    await closeBtn.first().click();
  } else {
    await page.getByTestId("close-position-btn").first().click();
  }

  await expect(page.getByTestId("close-position-dialog")).toBeVisible();
  await page.getByTestId("confirm-close-btn").click();

  // Final realized PnL shown.
  await expect(page.getByTestId("close-realized-pnl")).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByTestId("close-realized-pnl")).toContainText("Realized PnL");
});
