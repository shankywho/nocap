import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";
import { Receipt } from "@nocap/core";
import { MemoryStore, setStore } from "../src/server/store";
import { DELETE, GET as getOne } from "../app/api/receipts/[id]/route";
import { POST } from "../app/api/receipts/route";
import { GET as raw } from "../app/r/[id]/raw/route";
import { GET as scorecard } from "../app/api/scorecard/route";
import { GET as chain } from "../app/api/chains/[chainId]/route";

const sample = Receipt.parse(
  JSON.parse(readFileSync(new URL("../../../packages/core/test/__golden__/toothless.noexec.json", import.meta.url), "utf8")),
);
const post = (body: string) => POST(new Request("http://x.test/api/receipts", { method: "POST", body }));
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

beforeEach(() => setStore(new MemoryStore()));

describe("receipts API", () => {
  it("publishes, fetches, renders raw markdown and deletes with the token", async () => {
    const res = await post(JSON.stringify({ ...sample, extra: "stripped" }));
    expect(res.status).toBe(201);
    const { id, url, deleteToken } = await res.json();
    expect(url).toBe(`http://x.test/r/${id}`);

    const got = await (await getOne(new Request(url), ctx(id))).json();
    expect(got.id).toBe(id);
    expect(got.extra).toBeUndefined();

    const md = await raw(new Request(url), ctx(id));
    expect(md.headers.get("content-type")).toContain("text/markdown");
    expect((await md.text()).length).toBeGreaterThan(20);

    const bad = await DELETE(new Request(url, { method: "DELETE", headers: { "x-delete-token": "nope" } }), ctx(id));
    expect(bad.status).toBe(400);
    const ok = await DELETE(new Request(url, { method: "DELETE", headers: { "x-delete-token": deleteToken } }), ctx(id));
    expect(ok.status).toBe(204);
    expect((await getOne(new Request(url), ctx(id))).status).toBe(404);
  });

  it("rejects bad JSON and invalid receipts with the error envelope", async () => {
    const a = await post("{nope");
    expect(a.status).toBe(400);
    expect((await a.json()).error.code).toBe("INVALID_INPUT");
    const b = await post(JSON.stringify({ schemaVersion: 1 }));
    expect(b.status).toBe(400);
  });

  it("serves chains and the scorecard (n/a below 10 claims) with the caption", async () => {
    const { id } = await (await post(JSON.stringify(sample))).json();
    const c = await chain(new Request("http://x.test"), { params: Promise.resolve({ chainId: sample.chain.chainId }) });
    expect(c.status).toBe(200);
    expect((await c.json()).receipts).toHaveLength(1);
    expect((await chain(new Request("http://x.test"), { params: Promise.resolve({ chainId: "zzz" }) })).status).toBe(404);
    const s = await (await scorecard()).json();
    expect(s.caption).toContain("not a model benchmark");
    expect(s.rows[0].verifiedPct).toBeNull();
    expect(id).toBeTruthy();
  });
});

describe("example seed", () => {
  it("loads examples/*.json as isExample and links the loop chain", async () => {
    const { seedExamples } = await import("../src/server/store");
    const store = new MemoryStore();
    seedExamples(store, new URL("../../../examples", import.meta.url).pathname);
    const ex = await store.examples();
    expect(ex.map((e) => e.id).sort()).toEqual(["ex-count", "ex-loop-2", "ex-scope", "ex-toothless"]);
    const chainRows = await store.chain(ex.find((e) => e.id === "ex-toothless")!.receipt.chain.chainId);
    expect(chainRows.map((r) => r.receipt.overall)).toEqual(["FAIL", "PASS"]);
  });
});
