import { expect, test } from "@playwright/test";

test("landing → example receipt → CONTRADICTED → Trace tab", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("revert the fix");
  await page.getByRole("link", { name: /Tests that don't test/ }).click();
  await expect(page).toHaveURL(/\/r\/ex-toothless/);
  await expect(page.getByText("CONTRADICTED").first()).toBeVisible();
  await page.getByRole("link", { name: "trace" }).click();
  await expect(page).toHaveURL(/tab=trace/);
  await expect(page.getByRole("cell", { name: "extract" })).toBeVisible();
});

test("the demo PR streams steps and ends on a receipt with a ✗", async ({ page }) => {
  await page.goto("/verify");
  await expect(page.getByText("open the receipt")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/✗ CONTRADICTED/).first()).toBeVisible();
  await page.getByRole("link", { name: /open the receipt/ }).click();
  await expect(page.getByText("CONTRADICTED").first()).toBeVisible();
});

test("the repair loop plays FAIL → PASS from the landing page", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Play the repair loop" }).click();
  await expect(page.getByText("ATTEMPT 1: FAIL")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("ATTEMPT 2: PASS")).toBeVisible({ timeout: 30_000 });
  await expect(page.locator("[aria-live=polite]").first().getByRole("link", { name: /open the receipt/ })).toBeVisible();
});

test("unknown receipt is a 404 page, not a crash", async ({ page }) => {
  const res = await page.goto("/r/does-not-exist");
  expect(res?.status()).toBe(404);
});
