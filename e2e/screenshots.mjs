// Full-page screenshots of the landing page for docs/media (run after `next build && next start`, or against any URL).
import { chromium } from "@playwright/test";
import process from "node:process";

const url = process.argv[2] ?? "http://localhost:3123/";
const out = process.argv[3] ?? "../docs/media";
const browser = await chromium.launch();
for (const [name, width, height] of [["landing-1440", 1440, 900], ["landing-390", 390, 844]]) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  await page.goto(url, { waitUntil: "networkidle" });
  await page.emulateMedia({ reducedMotion: "reduce" }); // final state of the animated receipt, no mid-animation frames
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${out}/${name}.png`, fullPage: true });
  await page.close();
}
await browser.close();
