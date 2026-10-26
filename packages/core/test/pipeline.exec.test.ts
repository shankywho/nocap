import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildFixtures, SCENARIOS } from "../../../scripts/build-fixtures";
import { ExecaExec, FixedClock, MemoryLogger, NodeFs, SimpleGitPort } from "@nocap/core/adapters";
import { MockLlm } from "../src/adapters/llm.mock";
import { createExecStage } from "../src/exec/stage";
import { listWorktrees } from "../src/git/worktree";
import { verify } from "../src/pipeline";

const root = fileURLToPath(new URL("../../..", import.meta.url));
let cacheDir = "";

async function run(name: string, exec = true) {
  const repoPath = join(cacheDir, name);
  const summary = await readFile(join(root, "fixtures", "scenarios", name, "summary.md"), "utf8");
  const git = new SimpleGitPort(repoPath);
  const fs = new NodeFs();
  const execPort = new ExecaExec();
  const env = { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "", CI: "1" };
  const out = await verify({
    runId: `x-${name}`,
    summary,
    config: {
      repoPath, exec, offline: true, actor: "agent", model: null, role: null, agent: "mock",
      testTimeoutMs: 60_000, scopeOverrides: {}, roleScopes: {}, userScope: {}, alan: null, testCommand: null, testFormat: null,
    },
    deps: { git, exec: execPort, fs, llm: new MockLlm(), clock: new FixedClock(), logger: new MemoryLogger() },
    ...(exec ? { execStage: createExecStage({ git, exec: execPort, fs, runId: `x-${name}`, timeoutMs: 60_000, env }) } : {}),
  });
  return { ...out, leftover: (await listWorktrees(git, repoPath)).length };
}

describe("pipeline with exec", () => {
  beforeAll(async () => {
    cacheDir = await mkdtemp(join(tmpdir(), "nocap-exec-"));
    await buildFixtures({ quiet: true, cacheDir });
  }, 120_000);
  afterAll(async () => {
    await rm(cacheDir, { recursive: true, force: true });
  });

  it.each(SCENARIOS)("%s matches expected.json", async (name) => {
    const expected = JSON.parse(await readFile(join(root, "fixtures", "scenarios", name, "expected.json"), "utf8"));
    const { receipt, leftover } = await run(name);
    if (process.env.DEBUG_RECEIPT) console.error(name, JSON.stringify({ o: receipt.overall, c: receipt.claims.map((c) => [c.claim.type, c.verdict.status, c.verdict.reason, c.verdict.bitecheck?.outcome]), g: receipt.globalFlags, u: receipt.undisclosed.map((e) => e.kind === 'file' ? e.path : ''), trace: receipt.trace.filter((t) => t.status !== 'ok') }));
    expect(leftover).toBe(1); // only the main worktree; no leftovers
    expect(receipt.overall).toBe(expected.overall);
    for (const want of expected.claims) {
      const got = receipt.claims.find((c) => c.claim.type === want.type);
      expect(got, `${name}: ${want.type}`).toBeDefined();
      expect(got?.verdict.status, `${name}: ${want.type} status (${got?.verdict.reason})`).toBe(want.status);
      if (want.bitecheck) expect(got?.verdict.bitecheck?.outcome).toBe(want.bitecheck);
    }
    const flags = [...receipt.claims.flatMap((c) => c.verdict.flags), ...receipt.globalFlags].map((f) => f.rule);
    for (const f of expected.flags) expect(flags).toContain(f);
    if (expected.mustNotContradict) expect(receipt.claims.some((c) => c.verdict.status === "contradicted")).toBe(false);
  }, 120_000);

  it("leaves no worktrees when the runner command does not exist", async () => {
    const repoPath = join(cacheDir, "toothless");
    const git = new SimpleGitPort(repoPath);
    const fs = new NodeFs();
    const broken = { run: async (file: string, args: string[], o: Parameters<ExecaExec["run"]>[2]) => (file === "npx" ? { stdout: "", stderr: "ENOENT", exitCode: 127 } : new ExecaExec().run(file, args, o)) };
    const summary = await readFile(join(root, "fixtures", "scenarios", "toothless", "summary.md"), "utf8");
    const { receipt } = await verify({
      runId: "x-broken", summary,
      config: { repoPath, exec: true, offline: true, actor: "agent", model: null, role: null, agent: "mock", testTimeoutMs: 1000, scopeOverrides: {}, roleScopes: {}, userScope: {}, alan: null, testCommand: null, testFormat: null },
      deps: { git, exec: broken, fs, llm: new MockLlm(), clock: new FixedClock(), logger: new MemoryLogger() },
      execStage: createExecStage({ git, exec: broken, fs, runId: "x-broken", timeoutMs: 1000, env: { PATH: process.env.PATH ?? "" } }),
    });
    expect((await listWorktrees(git, repoPath)).length).toBe(1);
    expect(receipt.claims.find((c) => c.claim.type === "tests_added")?.verdict.status).toBe("unverifiable");
    expect(receipt.claims.some((c) => c.verdict.status === "contradicted")).toBe(false);
  }, 60_000);

  it("--no-exec on toothless never verifies tests_added", async () => {
    const { receipt } = await run("toothless", false);
    expect(receipt.claims.find((c) => c.claim.type === "tests_added")?.verdict.status).toBe("unverifiable");
  });
});
