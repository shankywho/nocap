import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { buildFixtures } from "../../../scripts/build-fixtures";
import { runCheck } from "../src/commands/check";
import { runRepair } from "../src/commands/repair";
import { preparePublishBody, publishReceipt } from "../src/io/publish";
import { parseScopeFlags } from "../src/io/config";
import { latestReceiptFile, loadReceipt } from "../src/io/store";

const root = fileURLToPath(new URL("../../..", import.meta.url));
let cacheDir = "";

async function check(name: string, extra: Record<string, unknown> = {}) {
  const summaryText = await readFile(join(root, "fixtures", "scenarios", name, "summary.md"), "utf8");
  const out = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  const errw = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  try {
    const res = await runCheck({ cwd: join(cacheDir, name), summaryText, agent: "mock", json: true, ...extra }, { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "", MOCK_EXTERNALS: "true" });
    return { ...res, stdout: out.mock.calls.map((c) => String(c[0])).join("") };
  } finally {
    out.mockRestore();
    errw.mockRestore();
  }
}

describe("nocap check exit codes", () => {
  beforeAll(async () => {
    cacheDir = await mkdtemp(join(tmpdir(), "nocap-cli-"));
    await buildFixtures({ quiet: true, cacheDir });
  }, 120_000);
  afterAll(async () => {
    await rm(cacheDir, { recursive: true, force: true });
  });

  it("honest -> 0", async () => {
    const r = await check("honest");
    expect(r.exitCode).toBe(0);
    expect(r.receipt?.overall).toBe("PASS");
    expect(JSON.parse(r.stdout).overall).toBe("PASS");
  }, 60_000);

  it("toothless -> 1, saves the receipt and hides .nocap from git", async () => {
    const r = await check("toothless");
    expect(r.exitCode).toBe(1);
    const dir = join(cacheDir, "toothless", ".nocap", "receipts");
    expect((await readdir(dir)).sort()).toEqual([`${r.receipt?.id}.json`, `${r.receipt?.id}.md`]);
    expect(await readFile(join(cacheDir, "toothless", ".git", "info", "exclude"), "utf8")).toContain(".nocap/");
    expect((await loadReceipt((await latestReceiptFile(join(cacheDir, "toothless"))) ?? "")).overall).toBe("FAIL");
  }, 60_000);

  it("tampered: MIXED -> 0, with --strict -> 3", async () => {
    expect((await check("tampered")).exitCode).toBe(0);
    expect((await check("tampered", { strict: true })).exitCode).toBe(3);
  }, 120_000);

  it("missing summary -> 2", async () => {
    const errw = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const r = await runCheck({ cwd: join(cacheDir, "honest"), summary: "/nonexistent/summary.md" });
    errw.mockRestore();
    expect(r.exitCode).toBe(2);
  });

  it("--no-exec never verifies tests_added", async () => {
    const r = await check("toothless", { exec: false });
    expect(r.receipt?.claims.find((c) => c.claim.type === "tests_added")?.verdict.status).toBe("unverifiable");
  }, 60_000);

  it("repair prints instructions for the last receipt and exits 0", async () => {
    await check("toothless");
    const out = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const code = await runRepair(undefined, false, join(cacheDir, "toothless"));
    const text = out.mock.calls.map((c) => String(c[0])).join("");
    out.mockRestore();
    expect(code).toBe(0);
    expect(text).toContain("Retracted");
  }, 60_000);

  // publish and config
  it("posts the stripped receipt and returns the url", async () => {
    const r = await check("toothless");
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ id: "abc", url: "http://x/r/abc", deleteToken: "t" }), { status: 201 }));
    const res = await publishReceipt(r.receipt!, { apiUrl: "http://x/", fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(res.url).toBe("http://x/r/abc");
    expect(fetchImpl).toHaveBeenCalledWith("http://x/api/receipts", expect.objectContaining({ method: "POST" }));
  }, 60_000);
  it("rejects on a non-2xx response", async () => {
    const r = await check("honest");
    const f = (async () => new Response("no", { status: 429 })) as unknown as typeof fetch;
    await expect(publishReceipt(r.receipt!, { apiUrl: "http://x", fetchImpl: f })).rejects.toThrow(/429/);
  }, 60_000);
  it("--no-hunks removes hunk evidence", async () => {
    const r = await check("scope_violation");
    const body = JSON.stringify(preparePublishBody(r.receipt!, true));
    expect(body).not.toContain('"kind":"hunk"');
    expect(JSON.stringify(preparePublishBody(r.receipt!, false))).toContain('"kind":"hunk"');
  }, 60_000);
  it("parses --scope flags", () => {
    expect(parseScopeFlags(["Auth=src/auth/**,lib/a/**"])).toEqual({ auth: ["src/auth/**", "lib/a/**"] });
    expect(() => parseScopeFlags(["bad"])).toThrow();
  });
});
