import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { runCheck } from "./check.js";

const run = promisify(execFile);

function findRepoRoot(): string | null {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 8; i++) {
    if (existsSync(join(dir, "fixtures", "scenarios")) && existsSync(join(dir, "scripts", "build-fixtures.ts"))) return dir;
    dir = resolve(dir, "..");
  }
  return null;
}

/** Builds a fixture scenario and verifies it with live output. Needs a source checkout (fixtures are not packaged yet). */
export async function runDemo(scenario: string, opts: { exec: boolean }): Promise<number> {
  const root = findRepoRoot();
  if (!root) {
    process.stderr.write("nocap: demo needs the nocap source checkout (fixtures/ and scripts/).\n");
    return 2;
  }
  const scenarioDir = join(root, "fixtures", "scenarios", scenario);
  if (!existsSync(scenarioDir)) {
    process.stderr.write(`nocap: unknown scenario '${scenario}'.\n`);
    return 2;
  }
  process.stderr.write(`building scenario ${scenario}...\n`);
  try {
    await run("pnpm", ["exec", "tsx", "scripts/build-fixtures.ts", scenario], { cwd: root });
  } catch (error) {
    process.stderr.write(`nocap: fixture build failed: ${(error instanceof Error ? error.message : String(error)).slice(0, 300)}\n`);
    return 2;
  }
  const summary = await readFile(join(scenarioDir, "summary.md"), "utf8");
  process.stdout.write(`\nAgent summary:\n${summary.trim().split("\n").map((l) => `  > ${l}`).join("\n")}\n\n`);
  const { exitCode } = await runCheck({
    cwd: join(root, ".cache", "fixtures", scenario),
    summaryText: summary,
    agent: "demo-agent",
    exec: opts.exec,
    offline: true,
    verbose: true,
    repair: true,
  });
  return exitCode;
}
