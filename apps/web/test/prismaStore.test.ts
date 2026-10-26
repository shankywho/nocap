import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { Receipt } from "@nocap/core";
import { PrismaStore, type PrismaLike } from "../src/server/prismaStore";
import { hashToken, headlineOf } from "../src/server/store";

type Row = Parameters<PrismaLike["receipt"]["upsert"]>[0]["create"] & { id: string; createdAt: Date };

/** In-memory stand-in for the generated client: same call shapes the store uses. */
function fakeDb() {
  const rows = new Map<string, Row>();
  const matches = (r: Row, where: Record<string, unknown> = {}) => Object.entries(where).every(([k, v]) => r[k] === v);
  const db: PrismaLike = {
    receipt: {
      upsert: async ({ where, create, update }) => {
        rows.set(where.id, rows.has(where.id) ? ({ ...rows.get(where.id), ...update } as Row) : (create as Row));
      },
      findUnique: async ({ where }) => (rows.get(where.id) as never) ?? null,
      delete: async ({ where }) => {
        if (!rows.delete(where.id)) throw new Error("not found");
      },
      findMany: async ({ where, orderBy }) => {
        const key = Object.keys((Array.isArray(orderBy) ? orderBy[0] : orderBy) ?? {})[0] ?? "createdAt";
        return [...rows.values()].filter((r) => matches(r, where)).sort((a, b) => (a[key] as number) - (b[key] as number) || String(a[key]).localeCompare(String(b[key]))) as never;
      },
    },
  };
  return { db, rows };
}

const sample = Receipt.parse(JSON.parse(readFileSync(new URL("../../../examples/ex-toothless.json", import.meta.url), "utf8")));
const stored = (id: string, over: Partial<Parameters<PrismaStore["put"]>[0]> = {}) => ({
  id,
  createdAt: "2026-10-26T10:00:00.000Z",
  source: "CLI" as const,
  isExample: false,
  headline: headlineOf(sample),
  deleteTokenHash: hashToken("tok"),
  receipt: { ...sample, id },
  ...over,
});

describe("PrismaStore", () => {
  it("round-trips a receipt through the row shape and keeps only the token hash", async () => {
    const { db, rows } = fakeDb();
    const store = new PrismaStore(db);
    await store.put(stored("a1"));
    const row = rows.get("a1") as Record<string, unknown>;
    expect(row).toMatchObject({ overall: "FAIL", chainId: sample.chain.chainId, attempt: 1, repo: null, contradictedCount: sample.totals.contradicted });
    expect(JSON.stringify(row)).not.toContain('"tok"');
    const got = await store.get("a1");
    expect(got?.receipt.id).toBe("a1");
    expect(got?.createdAt).toBe("2026-10-26T10:00:00.000Z");
    expect(await store.get("missing")).toBeNull();
  });

  it("upserts, lists examples vs published, orders chains by attempt and deletes", async () => {
    const { db } = fakeDb();
    const store = new PrismaStore(db);
    await store.put(stored("e1", { isExample: true }));
    await store.put(stored("p1"));
    await store.put(stored("p1", { headline: "updated" }));
    const second = { ...sample, id: "p2", chain: { ...sample.chain, attempt: 2, parentId: "p1" } };
    await store.put(stored("p2", { receipt: second }));
    expect((await store.examples()).map((r) => r.id)).toEqual(["e1"]);
    expect((await store.published()).map((r) => r.id).sort()).toEqual(["p1", "p2"]);
    expect((await store.chain(sample.chain.chainId)).map((r) => r.receipt.chain.attempt)).toEqual([1, 1, 2]);
    expect(await store.remove("p1")).toBe(true);
    expect(await store.remove("p1")).toBe(false);
  });

  it("rejects a stored payload that no longer matches the schema", async () => {
    const { db, rows } = fakeDb();
    const store = new PrismaStore(db);
    await store.put(stored("bad"));
    (rows.get("bad") as Record<string, unknown>).payload = { schemaVersion: 2 };
    await expect(store.get("bad")).rejects.toThrow();
  });
});
