// Generates the hero art from docs/media/source/hero-chess-extended.png with sharp (a dependency of Next.js).
// Output: apps/web/public/art/hero-{2400,1280}.{webp,avif}. Size budgets: 2400 webp <= 350 KB, 1280 webp <= 150 KB.
import { createRequire } from "node:module";
import { statSync } from "node:fs";
import { dirname, join } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(join(root, "apps/web/package.json"));
const sharp = require(require.resolve("sharp", { paths: [dirname(require.resolve("next/package.json"))] }));
const src = join(root, "docs/media/source/hero-chess-extended.png");
const out = join(root, "apps/web/public/art");
const BUDGET = { 2400: 350 * 1024, 1280: 150 * 1024 };

for (const width of [2400, 1280]) {
  // the source is 1915 px wide; 2400 is an upscale so the page can serve one file to wide screens
  let quality = 92;
  for (;;) {
    const file = join(out, `hero-${width}.webp`);
    await sharp(src).resize({ width, withoutEnlargement: false, kernel: "lanczos3" }).webp({ quality, effort: 6 }).toFile(file);
    const size = statSync(file).size;
    if (size <= BUDGET[width] || quality <= 30) break;
    quality -= 4;
  }
  await sharp(src).resize({ width, kernel: "lanczos3" }).avif({ quality: 70, effort: 6 }).toFile(join(out, `hero-${width}.avif`));
}
for (const f of ["hero-2400.webp", "hero-1280.webp", "hero-2400.avif", "hero-1280.avif"]) process.stdout.write(`${f} ${Math.round(statSync(join(out, f)).size / 1024)} KB\n`);
