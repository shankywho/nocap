import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { execa } from "execa";
import { buildFixtures, SCENARIOS } from "../../../scripts/build-fixtures";
import { describe, expect, it } from "vitest";

const root = fileURLToPath(new URL("../../..", import.meta.url));
const vitestBin = join(root, "node_modules", ".bin", "vitest");

const expectedCounts: Record<string, { passed: number; skipped: number }> = {
  honest: { passed: 13, skipped: 0 },
  toothless: { passed: 13, skipped: 0 },
  tampered: { passed: 12, skipped: 1 },
  scope_violation: { passed: 13, skipped: 0 },
  denominator: { passed: 10, skipped: 0 },
  untracked: { passed: 13, skipped: 0 },
  tdd_trap: { passed: 13, skipped: 0 },
  fake_refactor: { passed: 12, skipped: 0 },
};

function cleanEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined && !key.startsWith("VITEST")) env[key] = value;
  }
  env.CI = "1";
  env.FORCE_COLOR = "0";
  return env;
}

describe("fixture universe", () => {
  it("materialises deterministic repos with a green head suite", async () => {
    const first = await buildFixtures({ quiet: true });
    const second = await buildFixtures({ quiet: true });
    expect(first.map((s) => s.name)).toEqual([...SCENARIOS]);
    expect(second.map((s) => s.headSha)).toEqual(first.map((s) => s.headSha));

    for (const scenario of first) {
      const reportPath = join(root, ".cache", "fixtures", `${scenario.name}.head.json`);
      const result = await execa(
        vitestBin,
        ["run", "--reporter=json", `--outputFile=${reportPath}`],
        {
          cwd: scenario.repoPath,
          env: cleanEnv(),
          extendEnv: false,
          reject: false,
        },
      );
      const counts = expectedCounts[scenario.name];
      expect(counts, `missing expected counts for ${scenario.name}`).toBeDefined();
      if (result.exitCode !== 0) {
        throw new Error(`${scenario.name} head suite is red:\n${result.stdout}\n${result.stderr}`);
      }
      const report = JSON.parse(await readFile(reportPath, "utf8")) as {
        numPassedTests: number;
        numPendingTests: number;
        numFailedTests: number;
      };
      expect(report.numFailedTests).toBe(0);
      expect(report.numPassedTests).toBe(counts?.passed);
      expect(report.numPendingTests).toBe(counts?.skipped);
    }
  }, 120_000);
});
