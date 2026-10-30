import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { verifyLocal } from "@nocap/core/adapters";
import { buildFixtures } from "../../scripts/build-fixtures";
import { MARKER, runAction } from "../src/run";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
let tmp = "";
let built: Record<string, { repoPath: string; baseSha: string; headSha: string }> = {};

beforeAll(async () => {
  tmp = await mkdtemp(join(tmpdir(), "nocap-action-"));
  const list = await buildFixtures({ quiet: true, cacheDir: tmp, scenarios: ["toothless", "honest"] });
  built = Object.fromEntries(list.map((b) => [b.name, b]));
}, 120_000);
afterAll(async () => rm(tmp, { recursive: true, force: true }));

async function event(scenario: string, over: { fork?: boolean; body?: string | null } = {}) {
  const b = built[scenario]!;
  const summary = over.body === undefined ? await readFile(join(ROOT, "fixtures/scenarios", scenario, "summary.md"), "utf8") : over.body;
  const file = join(tmp, `event-${scenario}-${over.fork ? "fork" : "same"}.json`);
  await writeFile(file, JSON.stringify({ pull_request: { number: 7, body: summary, base: { sha: b.baseSha, repo: { full_name: "acme/shop" } }, head: { sha: b.headSha, repo: { full_name: over.fork ? "evil/shop" : "acme/shop" } } } }));
  return { GITHUB_EVENT_PATH: file, GITHUB_WORKSPACE: b.repoPath, PATH: process.env.PATH, HOME: process.env.HOME, INPUT_GITHUB_TOKEN: "SENTINEL_GH_TOKEN_42", INPUT_EXEC: "true" };
}

function fakeGithub(existing: { id: number; body: string }[] = [], postStatus = 201) {
  const calls: { url: string; method: string; body?: string; auth?: string }[] = [];
  const fetchImpl = (async (url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    calls.push({ url, method, ...(typeof init?.body === "string" ? { body: init.body } : {}), auth: (init?.headers as Record<string, string>)?.authorization ?? "" });
    if (method === "GET") return new Response(JSON.stringify(existing), { status: 200 });
    return new Response("{}", { status: postStatus });
  }) as unknown as typeof fetch;
  return { calls, fetchImpl };
}

describe("GitHub Action", () => {
  it("verifies a same-repo PR, comments the receipt and fails on FAIL", async () => {
    const gh = fakeGithub();
    const r = await runAction(await event("toothless"), { fetchImpl: gh.fetchImpl });
    expect(r).toMatchObject({ overall: "FAIL", commented: true, exitCode: 1, skipped: null });
    const post = gh.calls.find((c) => c.method === "POST")!;
    expect(post.url).toBe("https://api.github.com/repos/acme/shop/issues/7/comments");
    const body = (JSON.parse(post.body!) as { body: string }).body;
    expect(body.startsWith(MARKER)).toBe(true);
    expect(body).toContain("### ✗ Added tests for the retry backoff");
    expect(body).not.toContain("SENTINEL");
    expect(post.auth).toBe("Bearer SENTINEL_GH_TOKEN_42");
  }, 120_000);

  it("passes honest work with exit 0 and updates its previous comment instead of adding another", async () => {
    const gh = fakeGithub([{ id: 99, body: `${MARKER}\nold` }, { id: 100, body: "someone else" }]);
    const r = await runAction(await event("honest"), { fetchImpl: gh.fetchImpl });
    expect(r).toMatchObject({ overall: "PASS", exitCode: 0, commented: true });
    const patch = gh.calls.find((c) => c.method === "PATCH")!;
    expect(patch.url).toBe("https://api.github.com/repos/acme/shop/issues/comments/99");
    expect(gh.calls.some((c) => c.method === "POST")).toBe(false);
  }, 120_000);

  it("skips fork PRs: no verification, no network", async () => {
    const gh = fakeGithub();
    let verified = false;
    const r = await runAction(await event("toothless", { fork: true }), {
      fetchImpl: gh.fetchImpl,
      verify: async (...a) => {
        verified = true;
        return verifyLocal(...a);
      },
    });
    expect(r).toMatchObject({ skipped: "fork pull request", exitCode: 0, commented: false });
    expect(verified).toBe(false);
    expect(gh.calls).toEqual([]);
  });

  it("skips non-PR events and empty descriptions", async () => {
    expect((await runAction({})).skipped).toBe("not a pull_request event");
    expect((await runAction(await event("honest", { body: "  " }))).skipped).toContain("no summary");
  });

  it("fail-on=never keeps the step green", async () => {
    const gh = fakeGithub();
    const r = await runAction({ ...(await event("toothless")), INPUT_FAIL_ON: "never" }, { fetchImpl: gh.fetchImpl });
    expect(r).toMatchObject({ overall: "FAIL", exitCode: 0 });
  }, 120_000);

  it("a failed comment is reported, not thrown, and the verifier never receives the GitHub token", async () => {
    const gh = fakeGithub([], 403);
    const lines: string[] = [];
    let seenEnv: Record<string, string | undefined> = {};
    const r = await runAction(await event("honest"), {
      fetchImpl: gh.fetchImpl,
      log: (l) => lines.push(l),
      verify: async (opts, env) => {
        seenEnv = env;
        return verifyLocal(opts, env);
      },
    });
    expect(r.commented).toBe(false);
    expect(lines.join("\n")).toContain("pull-requests: write");
    expect(JSON.stringify(seenEnv)).not.toContain("SENTINEL");
    expect(seenEnv.NOCAP_OFFLINE).toBe("1");
  }, 120_000);
});
