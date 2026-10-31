import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildFixtures } from "../../../scripts/build-fixtures";
import { createServer } from "../src/server";

let cacheDir = "";
let client: Client;
const env = { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "", MOCK_EXTERNALS: "true" };

const textOf = (r: unknown) => ((r as { content: { text: string }[] }).content ?? []).map((c) => c.text);

describe("MCP server", () => {
  beforeAll(async () => {
    cacheDir = await mkdtemp(join(tmpdir(), "nocap-mcp-"));
    await buildFixtures({ quiet: true, cacheDir });
    const [a, b] = InMemoryTransport.createLinkedPair();
    await createServer(env).connect(a);
    client = new Client({ name: "test", version: "0" });
    await client.connect(b);
  }, 120_000);
  afterAll(async () => {
    await client.close();
    await rm(cacheDir, { recursive: true, force: true });
  });

  it("lists the tools with descriptions that say when to call them", async () => {
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(expect.arrayContaining(["bitecheck", "check_scope", "get_repair", "verify_claims"]));
    expect(tools.find((t) => t.name === "verify_claims")?.description).toContain("BEFORE telling the user you are done");
  });

  it("verify_claims on scope_violation: markdown names the file and the report status is fail", async () => {
    const repo = join(cacheDir, "scope_violation");
    const r = await client.callTool({ name: "verify_claims", arguments: { summary: "Added backoff to `withRetry` in src/retry.ts.\nDidn't touch auth.", repo_path: repo, exec: false } });
    const [md, json] = textOf(r);
    expect(md).toContain("src/auth/session.ts");
    const report = JSON.parse(json ?? "{}");
    expect(report.status).toBe("fail");
    expect(report.repairAvailable).toBe(true);
  }, 60_000);

  it("get_repair after a FAIL returns items matching the contradicted claims", async () => {
    const repo = join(cacheDir, "scope_violation");
    const r = await client.callTool({ name: "get_repair", arguments: { repo_path: repo } });
    const packet = JSON.parse(textOf(r)[1] ?? "{}");
    expect(packet.items.length).toBeGreaterThan(0);
    expect(packet.items[0].quote).toMatch(/touch auth/i);
  }, 60_000);

  it("bitecheck on the toothless test returns toothless", async () => {
    const r = await client.callTool({ name: "bitecheck", arguments: { repo_path: join(cacheDir, "toothless"), test_files: ["test/retry.test.ts"] } });
    expect(JSON.parse(textOf(r)[1] ?? "{}").outcome).toBe("toothless");
  }, 120_000);

  it("check_scope reports touched files", async () => {
    const r = await client.callTool({ name: "check_scope", arguments: { repo_path: join(cacheDir, "scope_violation"), concept: "auth" } });
    expect(textOf(r)[0]).toContain("src/auth/session.ts");
  }, 60_000);

  it("errors come back as text, never thrown", async () => {
    const r = await client.callTool({ name: "verify_claims", arguments: { summary: "x y z", repo_path: "/definitely/not/a/repo" } });
    expect(textOf(r)[0]).toMatch(/nocap could not verify/);
  }, 60_000);

  it("verify_external_claim is exposed and returns unverifiable when no API key is provided", async () => {
    const r = await client.callTool({
      name: "verify_external_claim",
      arguments: { claim: "cookies() is async in Next.js 15" },
    });
    const [md, json] = textOf(r);
    expect(md).toContain("UNVERIFIABLE via Anakin MCP");
    const data = JSON.parse(json ?? "{}");
    expect(data.status).toBe("unverifiable");
  });
});

