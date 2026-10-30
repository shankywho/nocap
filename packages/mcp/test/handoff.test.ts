import { appendFile, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ledgerFactsLocal, verifyLocal } from "@nocap/core/adapters";
import { buildFixtures } from "../../../scripts/build-fixtures";
import { createServer } from "../src/server";

const env = { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "", MOCK_EXTERNALS: "true" };
const root = new URL("../../..", import.meta.url).pathname;
let dir = "";
let repo = "";
let shas: { base: string; a: string; b: string };

describe("multi-agent handoff", () => {
  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "nocap-handoff-"));
    await buildFixtures({ quiet: true, cacheDir: dir, scenarios: ["handoff"] });
    repo = join(dir, "handoff");
    const meta = JSON.parse(await readFile(join(dir, "handoff.json"), "utf8")) as { baseSha: string; stages: Record<string, string> };
    shas = { base: meta.baseSha, a: meta.stages["01-backend"] as string, b: meta.stages["02-frontend"] as string };
  }, 120_000);
  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  const summary = (stage: string) => readFile(join(root, "fixtures", "scenarios", "handoff", "stages", stage, "summary.md"), "utf8");

  it("A's false claim is CONTRADICTED and surfaces to B through the ledger", async () => {
    const a = await verifyLocal({ repoPath: repo, summary: await summary("01-backend"), base: shas.base, head: shas.a, actor: "opencode", model: "glm-5.3-flash", role: "backend" }, env);
    const byType = (t: string) => a.receipt.claims.find((c) => c.claim.type === t)?.verdict;
    expect(byType("symbol_added")?.status).toBe("contradicted");
    expect(byType("tests_added")?.status).toBe("verified");
    expect(a.receipt.actor).toEqual({ agent: "opencode", model: "glm-5.3-flash", role: "backend" });

    const f = await ledgerFactsLocal({ repoPath: repo, query: "computeDelay" });
    expect(f.warnings).toBe(1);
    expect(f.markdown).toMatch(/CONTRADICTED/);
    expect(f.markdown).toContain("computeDelay");
  }, 120_000);

  it("B with --since-last is judged on its own delta; A's files are not undisclosed", async () => {
    const b = await verifyLocal({ repoPath: repo, summary: await summary("02-frontend"), sinceLast: true, exec: false, actor: "opencode", model: "deepseek-v4.1-flash", role: "frontend" }, env);
    expect(b.receipt.input.base).toBe(shas.a);
    expect(b.receipt.claims.find((c) => c.claim.type === "scope_none")?.verdict.status).toBe("verified");
    const undisclosed = b.receipt.undisclosed.flatMap((e) => (e.kind === "file" ? [e.path] : []));
    expect(undisclosed).not.toContain("src/backoff.ts");
    expect(b.receipt.overall).not.toBe("FAIL");
  }, 120_000);

  it("without --since-last, B would be blamed for A's file (the reason attribution exists)", async () => {
    const b = await verifyLocal({ repoPath: repo, summary: await summary("02-frontend"), base: shas.base, exec: false, role: "frontend", save: false }, env);
    expect(b.receipt.claims.find((c) => c.claim.type === "scope_none")?.verdict.status).toBe("contradicted");
  }, 120_000);

  it("cross-agent overlap is advisory: a warn flag, never a contradiction", async () => {
    const r = await verifyLocal({ repoPath: repo, summary: "Wired withRetry to getDelay.", base: shas.base, exec: false, role: "frontend", scopeRole: ["backend=src/backoff.ts"], save: false }, env);
    const flag = r.receipt.globalFlags.find((f) => f.rule === "cross_agent_overlap");
    expect(flag?.severity).toBe("warn");
    expect(flag?.detail).toContain("backend");
    expect(r.receipt.claims.every((c) => c.verdict.status !== "contradicted")).toBe(true);
  }, 60_000);

  it("editing src/backoff.ts makes A's earlier verified fact stale", async () => {
    const before = await ledgerFactsLocal({ repoPath: repo, query: "getDelay" });
    expect(before.trusted).toBeGreaterThan(0);
    await appendFile(join(repo, "src", "backoff.ts"), "\n// changed after the claim\n");
    const after = await ledgerFactsLocal({ repoPath: repo, query: "getDelay" });
    expect(after.trusted).toBe(0);
    expect(after.stale).toBeGreaterThan(0);
  }, 60_000);

  it("MCP lists all 7 tools; ledger_check answers a teammate's statement", async () => {
    const [x, y] = InMemoryTransport.createLinkedPair();
    await createServer(env).connect(x);
    const client = new Client({ name: "t", version: "0" });
    await client.connect(y);
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(["bitecheck", "check_scope", "get_repair", "ledger_check", "ledger_facts", "scorecard", "verify_claims"]);
    const r = (await client.callTool({ name: "ledger_check", arguments: { repo_path: repo, statement: "Added `computeDelay()` in src/backoff.ts and exported it." } })) as { content: { text: string }[] };
    expect(r.content[0]?.text).toMatch(/CONTRADICTED|unverified/);
    const sc = (await client.callTool({ name: "scorecard", arguments: { repo_path: repo } })) as { content: { text: string }[] };
    expect(sc.content[0]?.text).toContain("opencode");
    await client.close();
  }, 60_000);
});
