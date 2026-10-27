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

test("landing: the nav has Install and GitHub, and turns solid after the hero", async ({ page }) => {
  await page.goto("/");
  const header = page.locator("header").first();
  await expect(header.getByRole("link", { name: "Install" })).toBeVisible();
  await expect(header.getByRole("link", { name: "GitHub" })).toBeVisible();
  await expect(page.getByText("Try the demo")).toHaveCount(0);
  await expect(header).toHaveClass(/bg-transparent/);
  await page.mouse.wheel(0, 1400);
  await expect(header).toHaveClass(/bg-wall/);
});

test("landing: Install in the nav scrolls to the install section", async ({ page }) => {
  await page.goto("/");
  await page.locator("header").getByRole("link", { name: "Install" }).click();
  await expect(page).toHaveURL(/#no-5/);
  await expect(page.getByRole("heading", { name: "Install for your agent" })).toBeInViewport();
});

test("landing: hanging numerals 1 to 8 in order, and the hero install block shows real usage", async ({ page }) => {
  await page.goto("/");
  expect(await page.locator("[data-numeral]").allInnerTexts()).toEqual(["1", "2", "3", "4", "5", "6", "7", "8"]);
  const hero = page.locator("section").first();
  await expect(hero.getByText("npx @shankywho/nocap init --all")).toBeVisible();
  await expect(hero.getByText("npx @shankywho/nocap check")).toBeVisible();
  await expect(hero.getByText("Want to see it first?")).toBeVisible();
});

test("hero button runs the Bitecheck example and shows the verdict", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "See it catch a bad test" }).click();
  await expect(page.getByText("✗ toothless.")).toBeVisible();
});

test("FAQ answers collapse and expand", async ({ page }) => {
  await page.goto("/#no-8");
  const first = page.locator("details").first();
  await expect(first).not.toHaveAttribute("open", "");
  await first.locator("summary").click();
  await expect(first).toHaveAttribute("open", "");
});

test("dogfood receipts are not clipped: the full first line is in the page", async ({ page }) => {
  await page.goto("/#no-6");
  const text = await page.locator("#no-6 pre", { hasText: "receipt c735f1da69" }).innerText();
  expect(text).toContain("All six fixes are done and pushed to `origin/main`, with small commits and a test for each");
  expect(text).not.toContain("...");
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

test("Replay this chain streams the stored chain into its own card, FAIL then PASS", async ({ page }) => {
  await page.goto("/#no-3");
  const card = page.locator("[aria-live=polite]").first();
  await expect(card).toContainText("Attempt 2: ✓ PASS"); // the final state is shown before any replay
  await page.getByRole("button", { name: "Replay this chain" }).click();
  await expect(card).toContainText("Attempt 1: ✗ FAIL", { timeout: 30_000 });
  await expect(card).toContainText("Repair packet:", { timeout: 30_000 });
  await expect(card).toContainText("Attempt 2: ✓ PASS", { timeout: 30_000 });
  await expect(card).toContainText("Chain outcome: resolved", { timeout: 30_000 });
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

test.describe("JavaScript disabled", () => {
  test.use({ javaScriptEnabled: false });
  const titles = ["How it checks a claim", "Bitecheck: revert the fix, rerun the tests", "Repair loop", "Multi-agent handoff", "Install for your agent", "Dogfooding", "Limitations", "FAQ"];

  test("every section title (1 to 8) and its first paragraph are visible on first paint", async ({ page }) => {
    await page.goto("/");
    for (const [i, title] of titles.entries()) {
      const section = page.locator(`#no-${i + 1}`);
      await expect(section.getByRole("heading", { level: 2, name: title })).toBeVisible();
      const first = section.locator("p").first();
      await expect(first).toBeVisible();
      expect((await first.innerText()).trim().length).toBeGreaterThan(10);
      const style = await first.evaluate((el) => {
        const cs = getComputedStyle(el);
        return { opacity: cs.opacity, visibility: cs.visibility, display: cs.display };
      });
      expect(Number(style.opacity)).toBeGreaterThan(0);
      expect(style.visibility).toBe("visible");
      expect(style.display).not.toBe("none");
    }
  });

  test("the hero, the receipts and every verdict are present without JavaScript", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Check what your coding agent says it did.");
    await expect(page.locator("#no-1 .doc").getByText("verified").first()).toBeVisible();
    await expect(page.locator("#no-1 .doc").getByText("contradicted").first()).toBeVisible();
    await expect(page.locator("#no-1 .doc").getByText("not checked yet")).toHaveCount(0);
    await expect(page.locator("#no-3").getByText("Attempt 2: ✓ PASS")).toBeVisible();
  });
});

test("the copy button sits in the corner of the code block and never overlaps the text", async ({ page }) => {
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    const block = page.locator("section").first().locator(".doc").first();
    const button = block.getByRole("button", { name: "Copy the commands" });
    const pre = block.locator("pre");
    const b = (await button.boundingBox())!;
    const box = (await block.boundingBox())!;
    expect(b.x + b.width).toBeLessThanOrEqual(box.x + box.width + 1);
    expect(b.y).toBeLessThanOrEqual(box.y + 2);
    // no line of the commands runs under the button
    const overlap = await pre.evaluate((el, left) => {
      const range = document.createRange();
      range.selectNodeContents(el);
      const top = el.getBoundingClientRect().top;
      return [...range.getClientRects()].some((r) => r.width > 0 && r.right > left && r.top < top + 40);
    }, b.x);
    expect(overlap).toBe(false);
  }
});

