import { expect, test } from "@playwright/test";

test("foundation: option chain renders with live IV", async ({ page }) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: /Delta Trader — Paper/i }),
  ).toBeVisible();

  // Expiry selector defaults to the nearest expiry; pick BTC nearest explicitly.
  const expirySelect = page.getByLabel("Select expiry");
  await expect(expirySelect).toBeEnabled();
  const firstOption = await expirySelect
    .locator("option")
    .first()
    .getAttribute("value");
  if (firstOption) {
    await expirySelect.selectOption(firstOption);
  }

  // Wait for the option chain to populate.
  const rows = page.getByTestId("chain-row");
  await expect(async () => {
    expect(await rows.count()).toBeGreaterThanOrEqual(10);
  }).toPass({ timeout: 15000 });

  // IV cells must be non-empty (not the em-dash placeholder).
  const ivCells = page.getByTestId("iv-cell");
  const ivCount = await ivCells.count();
  expect(ivCount).toBeGreaterThanOrEqual(1);

  let nonEmpty = 0;
  for (let i = 0; i < Math.min(ivCount, 20); i++) {
    const text = (await ivCells.nth(i).textContent())?.trim() ?? "";
    if (text !== "" && text !== "—") nonEmpty++;
  }
  expect(nonEmpty).toBeGreaterThanOrEqual(1);
});
