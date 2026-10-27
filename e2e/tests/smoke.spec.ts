import { expect, test } from "@playwright/test";

// At 1440x900 the hero is shorter than the viewport. Chrome ignores an image that covers the whole viewport as a background,
// so on shorter or narrower viewports the headline is the LCP element instead.
test.use({ viewport: { width: 1440, height: 900 } });

test("landing: the hero painting is the largest contentful paint and the headline is the spec's", async ({ page }) => {
  await page.addInitScript(() => {
    (window as unknown as { __lcp: { tag: string; src: string }[] }).__lcp = [];
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        const el = (e as unknown as { element?: Element }).element;
        (window as unknown as { __lcp: { tag: string; src: string }[] }).__lcp.push({ tag: el?.tagName ?? "", src: (el as HTMLImageElement | undefined)?.currentSrc ?? "" });
      }
    }).observe({ type: "largest-contentful-paint", buffered: true });
  });
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Check what your coding agent says it did.");
  await page.waitForTimeout(1500);
  const lcp = await page.evaluate(() => (window as unknown as { __lcp: { tag: string; src: string }[] }).__lcp);
  const last = lcp[lcp.length - 1];
  expect(last?.tag).toBe("IMG");
  expect(last?.src).toMatch(/hero-(1280|2400)\.(webp|avif)/);
  await expect(page.getByText("After Thomas Eakins, The Chess Players (1876)").first()).toBeVisible();
});

test("landing: the nav turns solid after the hero", async ({ page }) => {
  await page.goto("/");
  const header = page.locator("header").first();
  await expect(header).toHaveClass(/bg-transparent/);
  await page.mouse.wheel(0, 1400);
  await expect(header).toHaveClass(/bg-wall/);
});

test("landing: sections are numbered No. 1 to No. 8 in order", async ({ page }) => {
  await page.goto("/");
  const labels = await page.locator("p.label").allInnerTexts();
  expect(labels).toEqual(["No. 1", "No. 2", "No. 3", "No. 4", "No. 5", "No. 6", "No. 7", "No. 8"]);
});

test("Bitecheck demo: revert shows toothless; a stubbed new function shows bites (stub)", async ({ page }) => {
  await page.goto("/#no-2");
  await page.getByRole("button", { name: "Revert the change" }).click();
  await expect(page.getByText("✗ toothless.")).toBeVisible();
  await page.getByRole("button", { name: "New function, test checks the result" }).click();
  await page.getByRole("button", { name: "Stub the body" }).click();
  await expect(page.getByText("✓ bites (stub).")).toBeVisible();
  await page.getByRole("button", { name: "New function, test checks it exists" }).click();
  await page.getByRole("button", { name: "Stub the body" }).click();
  await expect(page.getByText("✗ toothless (stub).")).toBeVisible();
});

test("example receipt: CONTRADICTED, then the Trace tab", async ({ page }) => {
  await page.goto("/r/ex-toothless");
  await expect(page.getByText("CONTRADICTED").first()).toBeVisible();
  await page.getByRole("link", { name: "trace" }).click();
  await expect(page).toHaveURL(/tab=trace/);
  await expect(page.getByRole("cell", { name: "extract" })).toBeVisible();
});

test("the demo PR streams steps and ends on a receipt with a ✗", async ({ page }) => {
  await page.goto("/verify");
  await expect(page.getByText("open the receipt")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/✗ contradicted/).first()).toBeVisible();
  await page.getByRole("link", { name: /open the receipt/ }).click();
  await expect(page.getByText("CONTRADICTED").first()).toBeVisible();
});

test("the repair loop plays FAIL then PASS from the landing page", async ({ page }) => {
  await page.goto("/#no-3");
  await page.getByRole("button", { name: "Play the repair loop" }).click();
  await expect(page.getByText("ATTEMPT 1: FAIL")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("ATTEMPT 2: PASS")).toBeVisible({ timeout: 30_000 });
  await expect(page.locator("[aria-live=polite]").first().getByRole("link", { name: /open the receipt/ })).toBeVisible();
});

test("install tabs switch agents and show the init command", async ({ page }) => {
  await page.goto("/#no-5");
  await page.getByRole("tab", { name: "Codex" }).click();
  await expect(page.getByText("npx @shankywho/nocap init --all --write --user")).toBeVisible();
});

test("unknown receipt is a 404 page, not a crash", async ({ page }) => {
  const res = await page.goto("/r/does-not-exist");
  expect(res?.status()).toBe(404);
});
