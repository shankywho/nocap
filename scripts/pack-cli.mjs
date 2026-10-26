// Bundles the CLI (and the workspace packages it imports) into one file and packs a self-contained tarball.
// A separate staging manifest is used so the workspace package.json keeps its workspace:* deps and the lockfile stays valid.
import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(join(root, "package.json"));
const { build } = require(require.resolve("esbuild", { paths: [require.resolve("tsx")] }));

const stage = join(root, ".cache", "pack-cli");
rmSync(stage, { recursive: true, force: true });
mkdirSync(join(stage, "bundle"), { recursive: true });

await build({
  entryPoints: [join(root, "apps/cli/src/index.ts")],
  outfile: join(stage, "bundle/nocap.js"),
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  logLevel: "warning",
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
});

// Demo support: the fixture builder and the fixtures themselves ship in the tarball.
await build({
  entryPoints: [join(root, "scripts/build-fixtures.ts")],
  outfile: join(stage, "bundle/build-fixtures.js"),
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  logLevel: "warning",
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
});
cpSync(join(root, "fixtures/project"), join(stage, "fixtures/project"), { recursive: true });
cpSync(join(root, "fixtures/scenarios"), join(stage, "fixtures/scenarios"), { recursive: true });

const src = JSON.parse(readFileSync(join(root, "apps/cli/package.json"), "utf8"));
writeFileSync(
  join(stage, "package.json"),
  `${JSON.stringify({ name: src.name, version: src.version, description: src.description, license: src.license, type: "module", bin: { nocap: "./bundle/nocap.js" }, files: ["bundle", "fixtures", "README.md"], engines: src.engines }, null, 2)}\n`,
);
cpSync(join(root, "apps/cli/README.md"), join(stage, "README.md"));
const out = execFileSync("npm", ["pack", "--silent"], { cwd: stage, encoding: "utf8" }).trim();
process.stdout.write(`${join(stage, out)}\n`);
