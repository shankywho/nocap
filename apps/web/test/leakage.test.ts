import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Receipt } from "@nocap/core";
import { GET as health } from "../app/api/health/route";
import { GET as examples } from "../app/api/examples/route";
import { GET as getOne } from "../app/api/receipts/[id]/route";
import { GET as raw } from "../app/r/[id]/raw/route";
import { POST as publish } from "../app/api/receipts/route";
import { POST as verifyPr } from "../app/api/verify-pr/route";
import { GET as chain } from "../app/api/chains/[chainId]/route";
import { GET as scorecard } from "../app/api/scorecard/route";
import { MemoryStore, seedExamples, setStore } from "../src/server/store";
import { sse } from "../src/server/run";

const SECRETS = { LLM_API_KEY: "SENTINEL_LLM_KEY_1", LLM_FALLBACK_API_KEY: "SENTINEL_FB_KEY_2", GITHUB_TOKEN: "SENTINEL_GH_3", DATABASE_URL: "postgres://SENTINEL_U:SENTINEL_P@h/db" };
const saved: Record<string, string | undefined> = {};
const sample = Receipt.parse(JSON.parse(readFileSync(new URL("../../../examples/ex-toothless.json", import.meta.url), "utf8")));
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  for (const [k, v] of Object.entries(SECRETS)) {
    saved[k] = process.env[k];
    process.env[k] = v;
  }
  const s = new MemoryStore();
  seedExamples(s, new URL("../../../examples", import.meta.url).pathname);
  setStore(s);
});
afterEach(() => {
  for (const k of Object.keys(SECRETS)) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

const text = async (r: Response) => r.text();
const clean = (s: string) => {
  expect(s).not.toContain("SENTINEL");
  expect(s).not.toMatch(/deleteTokenHash|at .*\.(ts|js):\d+/);
};

describe("web API leakage", () => {
  it("health reports modes, never keys or the database url", async () => {
    const body = await text(await health());
    clean(body);
    expect(JSON.parse(body)).toHaveProperty("db");
  });

  it("read endpoints never return delete tokens or hashes", async () => {
    const pub = await (await publish(new Request("http://x.test/api/receipts", { method: "POST", body: JSON.stringify(sample) }))).json();
    for (const res of [await getOne(new Request("http://x.test"), ctx(pub.id)), await raw(new Request("http://x.test"), ctx(pub.id)), await examples(), await scorecard(), await chain(new Request("http://x.test"), { params: Promise.resolve({ chainId: sample.chain.chainId }) })]) {
      const body = await text(res);
      clean(body);
      expect(body).not.toContain(pub.deleteToken);
    }
  });

  it("publish returns the delete token exactly once and the store keeps only its hash", async () => {
    const pub = await (await publish(new Request("http://x.test/api/receipts", { method: "POST", body: JSON.stringify(sample) }))).json();
    const { getStore } = await import("../src/server/store");
    const row = await getStore().get(pub.id);
    expect(row?.deleteTokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(row?.receipt)).not.toContain(pub.deleteToken);
  });

  it("errors use the envelope with no stack, path or secret", async () => {
    const bad = await publish(new Request("http://x.test/api/receipts", { method: "POST", body: "{nope" }));
    const body = await text(bad);
    clean(body);
    expect(JSON.parse(body).error.code).toBe("INVALID_INPUT");
    expect(await text(await getOne(new Request("http://x.test"), ctx("missing")))).not.toMatch(/\/Users|node_modules/);
  });

  it("SSE internal errors are generic", async () => {
    const res = sse(async () => {
      throw new Error(`boom with ${process.env.LLM_API_KEY} at /Users/me/secret.ts:1`);
    });
    const body = await text(res);
    clean(body);
    expect(body).toContain("Something went wrong.");
    expect(body).not.toContain("/Users/me");
  });

  it("verify-pr on a private repo gives a friendly error without leaking the token", async () => {
    const res = await verifyPr(new Request("http://x.test/api/verify-pr", { method: "POST", body: JSON.stringify({ prUrl: "https://github.com/acme/private/pull/1" }) }));
    const body = await text(res);
    clean(body);
    expect(body).toContain("GITHUB_UNAVAILABLE");
  });
});
