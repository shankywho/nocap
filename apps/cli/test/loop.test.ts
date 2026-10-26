import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { buildFixtures } from "../../../scripts/build-fixtures";
import { runLoop } from "../src/commands/loop";

const root = fileURLToPath(new URL("../../..", import.meta.url));
let cacheDir = "";

const env = () => ({ PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "", MOCK_EXTERNALS: "true" });
const mockAgent = `${join(root, "node_modules", ".bin", "tsx")} --tsconfig ${join(root, "tsconfig.tools.json")} ${join(root, "scripts", "mock-agent.ts")} {repair_file}`;

async function loop(name: string, agentCmd = mockAgent, max = "3") {
  const out = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  const err = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  try {
    const summaryText = await readFile(join(root, "fixtures", "scenarios", name, "summary.md"), "utf8");
    const dir = await mkdtemp(join(cacheDir, `${name}-`));
    await buildFixtures({ quiet: true, cacheDir: dir, scenarios: [name] });
    const cwd = join(dir, name);
    const code = await runLoop({ agentCmd, summaryText, cwd, max, agent: "mock-agent" }, env());
    const chains = join(cwd, ".nocap", "chains");
    const { readdir } = await import("node:fs/promises");
    const file = (await readdir(chains))[0] ?? "";
    const last = JSON.parse(await readFile(join(chains, file), "utf8"));
    return { code, last, log: err.mock.calls.map((c) => String(c[0])).join("") };
  } finally {
    out.mockRestore();
    err.mockRestore();
  }
}

describe("repair loop with the scripted agent", () => {
  beforeAll(async () => {
    cacheDir = await mkdtemp(join(tmpdir(), "nocap-loop-"));
  });
  afterAll(async () => {
    await rm(cacheDir, { recursive: true, force: true });
  });

  it("toothless: FAIL -> PASS in 2 attempts, chain resolved, exit 0", async () => {
    const r = await loop("toothless");
    expect(r.code).toBe(0);
    expect(r.last.chain.attempt).toBe(2);
    expect(r.last.chain.outcome).toBe("resolved");
    expect(r.last.chain.parentId).not.toBeNull();
    expect(r.last.overall).toBe("PASS");
    expect(r.last.chain.items[0].status).toBe("fixed");
  }, 180_000);

  it.each(["scope_violation", "fake_refactor"])("%s resolves by fixing", async (name) => {
    const r = await loop(name);
    expect(r.code).toBe(0);
    expect(r.last.chain.outcome).toBe("resolved");
    expect(r.last.chain.items.every((i: { status: string }) => i.status === "fixed")).toBe(true);
  }, 180_000);

  it("denominator resolves by honest retraction and stays MIXED", async () => {
    const r = await loop("denominator");
    expect(r.last.chain.outcome).toBe("resolved");
    expect(r.last.chain.items.some((i: { status: string }) => i.status === "retracted")).toBe(true);
    expect(r.last.overall).toBe("MIXED");
    expect(r.code).toBe(0);
  }, 180_000);

  it("toothless_gamed: dropped silently + weakened tests -> unresolved, exit 1", async () => {
    const r = await loop("toothless_gamed");
    expect(r.code).toBe(1);
    expect(r.last.chain.outcome).toBe("unresolved");
    expect(r.last.chain.items.map((i: { status: string }) => i.status)).toContain("dropped_silently");
    expect(r.last.globalFlags.map((f: { rule: string }) => f.rule)).toEqual(expect.arrayContaining(["dropped_silently", "repair_by_weakening"]));
    expect(r.last.overall).toBe("FAIL");
  }, 180_000);

  it("an agent that changes nothing stops after 2 attempts with 'no progress'", async () => {
    const r = await loop("toothless", "cat {repair_file} > /dev/null; cat fixtures_summary.txt 2>/dev/null || echo 'Added tests for the retry backoff in test/retry.test.ts.'", "5");
    expect(r.last.chain.attempt).toBe(2);
    expect(r.log).toContain("no progress");
    expect(r.code).toBe(1);
  }, 180_000);
});
