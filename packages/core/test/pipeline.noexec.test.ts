import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildFixtures, SCENARIOS } from "../../../scripts/build-fixtures";
import { ExecaExec, FixedClock, MemoryLogger, NodeFs, SimpleGitPort } from "@nocap/core/adapters";
import { MockLlm } from "../src/adapters/llm.mock";
import { verify } from "../src/pipeline";

const root = fileURLToPath(new URL("../../..", import.meta.url));

let cacheDir = "";

async function run(name: string) {
  const repoPath = join(cacheDir, name);
  const summary = await readFile(join(root, "fixtures", "scenarios", name, "summary.md"), "utf8");
  const clock = new FixedClock();
  return verify({
    runId: `run-${name}`,
    summary,
    config: {
      repoPath, exec: false, offline: true, actor: "agent", model: null, role: null, agent: "mock",
      testTimeoutMs: 1000, scopeOverrides: {}, roleScopes: {}, userScope: {}, alan: null, testCommand: null, testFormat: null,
    },
    deps: { git: new SimpleGitPort(repoPath), exec: new ExecaExec(), fs: new NodeFs(), llm: new MockLlm(), clock, logger: new MemoryLogger() },
  });
}

describe("pipeline --no-exec", () => {
  beforeAll(async () => {
    cacheDir = await mkdtemp(join(tmpdir(), "nocap-noexec-"));
    await buildFixtures({ quiet: true, cacheDir });
  }, 120_000);

  afterAll(async () => {
    await rm(cacheDir, { recursive: true, force: true });
  });

  it.each(SCENARIOS)("%s matches expected statuses without exec", async (name) => {
    const expected = JSON.parse(await readFile(join(root, "fixtures", "scenarios", name, "expected.json"), "utf8"));
    const { receipt } = await run(name);
    const got = receipt.claims.map((c) => ({ type: c.claim.type, status: c.verdict.status }));
    const goldenPath = join(root, "packages", "core", "test", "__golden__", `${name}.noexec.json`);
    const normalised = JSON.stringify(
      { ...receipt, id: "ID", runId: "RUN", createdAt: "T", durationMs: 0, trace: receipt.trace.map((t) => ({ ...t, ms: 0, detail: t.detail.replace(/[0-9a-f]{7}\.\.[0-9a-f]{7}/, "BASE..HEAD") })),
        input: { ...receipt.input, base: "BASE", head: "HEAD" } },
      null, 2,
    ) + "\n";
    if (process.env.UPDATE_GOLDEN) {
      await mkdir(join(goldenPath, ".."), { recursive: true });
      await writeFile(goldenPath, normalised);
    }
    expect(normalised).toBe(await readFile(goldenPath, "utf8"));
    // Exec-backed claims can never be verified or contradicted-by-exec here.
    for (const claim of expected.claims) {
      const actual = got.find((g) => g.type === claim.type);
      expect(actual, `${name}: missing ${claim.type}`).toBeDefined();
    }
    if (expected.mustNotContradict) expect(got.some((g) => g.status === "contradicted")).toBe(false);
  }, 30_000);
});
