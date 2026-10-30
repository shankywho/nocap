// Bundles the GitHub Action into action/dist/index.js (committed, so the action runs without an install step).
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(join(root, "package.json"));
const { build } = require(require.resolve("esbuild", { paths: [require.resolve("tsx")] }));

await build({
  entryPoints: [join(root, "action/src/main.ts")],
  outfile: join(root, "action/dist/index.js"),
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node24",
  alias: {
    "@nocap/core/adapters": join(root, "packages/core/src/adapters/index.ts"),
    "@nocap/core": join(root, "packages/core/src/index.ts"),
  },
  logLevel: "warning",
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
});
