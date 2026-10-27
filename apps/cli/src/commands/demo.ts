import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { tmpdir } from "node:os";
import { llmStatus } from "@nocap/core/adapters";
import { runCheck } from "./check.js";

const run = promisify(execFile);

type Layout = { root: string; packaged: boolean };

/** A source checkout has scripts/build-fixtures.ts; the npm tarball ships fixtures/ and bundle/build-fixtures.js. */
function findLayout(): Layout | null {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 8; i++) {
    if (existsSync(join(dir, "fixtures", "scenarios"))) {
      if (existsSync(join(dir, "scripts", "build-fixtures.ts"))) return { root: dir, packaged: false };
      if (existsSync(join(dir, "bundle", "build-fixtures.js"))) return { root: dir, packaged: true };
    }
    dir = resolve(dir, "..");
  }
  return null;
}

/**
 * The demo is deterministic and offline by default. `--live` uses the configured model key instead, and refuses
 * (rather than silently falling back) when there is none.
 */
export function demoMode(live: boolean, env: NodeJS.ProcessEnv = process.env): { ok: true; offline: boolean } | { ok: false; message: string } {
  if (!live) return { ok: true, offline: true };
  if (llmStatus(env, false).mode !== "llm") {
    return { ok: false, message: "demo --live needs a model key: run `nocap config set llm-key <key>` or set GROQ_API_KEY. Without --live the demo is deterministic and offline." };
  }
  return { ok: true, offline: false };
}

/** Builds a fixture scenario and verifies it with live output. Works from a source checkout or the npm package. */
export async function runDemo(scenario: string, opts: { exec: boolean; live?: boolean }): Promise<number> {
  const mode = demoMode(opts.live === true);
  if (!mode.ok) {
    process.stderr.write(`nocap: ${mode.message}\n`);
    return 2;
  }
  const layout = findLayout();
  if (!layout) {
    process.stderr.write("nocap: demo fixtures not found (expected a nocap checkout or the npm package).\n");
    return 2;
  }
  const { root, packaged } = layout;
  const cacheDir = packaged ? join(tmpdir(), "nocap-demo") : join(root, ".cache", "fixtures");
  const scenarioDir = join(root, "fixtures", "scenarios", scenario);
  if (!existsSync(scenarioDir)) {
    process.stderr.write(`nocap: unknown scenario '${scenario}'.\n`);
    return 2;
  }
  process.stderr.write(`building scenario ${scenario}...\n`);
  try {
    if (packaged) {
      await run("node", [join(root, "bundle", "build-fixtures.js"), scenario], { cwd: root, env: { ...process.env, NOCAP_FIXTURES_ROOT: root, NOCAP_FIXTURES_CACHE: cacheDir } });
    } else {
      await run("pnpm", ["exec", "tsx", "scripts/build-fixtures.ts", scenario], { cwd: root });
    }
  } catch (error) {
    process.stderr.write(`nocap: fixture build failed: ${(error instanceof Error ? error.message : String(error)).slice(0, 300)}\n`);
    return 2;
  }
  let exec = opts.exec;
  if (packaged && exec) {
    // The fixture project has no dependencies of its own; install the test runner once so Bitecheck can run.
    process.stderr.write("installing vitest for the demo project...\n");
    try {
      await run("npm", ["install", "--no-audit", "--no-fund", "--silent", "--no-save", "vitest"], { cwd: join(cacheDir, scenario) });
    } catch {
      process.stderr.write("nocap: could not install vitest (offline?). Running static checks only.\n");
      exec = false;
    }
  }
  const summary = await readFile(join(scenarioDir, "summary.md"), "utf8");
  process.stdout.write(`\nAgent summary:\n${summary.trim().split("\n").map((l) => `  > ${l}`).join("\n")}\n\n`);
  const { exitCode } = await runCheck({
    cwd: join(cacheDir, scenario),
    summaryText: summary,
    agent: "demo-agent",
    exec,
    offline: mode.offline,
    verbose: true,
    repair: true,
  });
  return exitCode;
}
