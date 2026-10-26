import { beforeEach, describe, expect, it } from "vitest";
import { MemoryStore, getStore, seedExamples, setStore } from "../src/server/store";
import { POST as demo } from "../app/api/demo/route";
import { POST as loop } from "../app/api/demo/loop/route";
import { POST as verifyPr } from "../app/api/verify-pr/route";

async function events(res: Response) {
  const text = await res.text();
  return text.split("\n\n").filter(Boolean).map((b) => {
    const [e, d] = b.split("\n");
    return { event: e!.slice(7), data: JSON.parse(d!.slice(6)) };
  });
}
const post = (path: string, body?: unknown) => new Request(`http://x.test${path}`, { method: "POST", body: body ? JSON.stringify(body) : null });

beforeEach(() => {
  const s = new MemoryStore();
  seedExamples(s, new URL("../../../examples", import.meta.url).pathname);
  setStore(s);
});

describe("PR demo (no keys)", () => {
  it("streams step events then done, with CI green, auth touched and tests needing execution", async () => {
    const ev = await events(await demo(post("/api/demo")));
    expect(ev.filter((e) => e.event === "step").length).toBeGreaterThan(3);
    const done = ev.at(-1)!;
    expect(done.event).toBe("done");
    const stored = await getStore().get(done.data.id);
    const by = (t: string) => stored!.receipt.claims.find((c) => c.claim.type === t)?.verdict.status;
    expect(by("tests_pass")).toBe("verified");
    expect(by("scope_none")).toBe("contradicted");
    expect(by("tests_added")).toBe("unverifiable");
    expect(stored!.receipt.overall).toBe("FAIL");
    expect(stored!.receipt.input.mode).toBe("pr");
  });

  it("turns GitHub trouble and bad URLs into error events, not 500s", async () => {
    const a = await events(await verifyPr(post("/api/verify-pr", { prUrl: "https://github.com/acme/private/pull/1" })));
    expect(a.at(-1)).toMatchObject({ event: "error", data: { code: "GITHUB_UNAVAILABLE" } });
    const b = await events(await verifyPr(post("/api/verify-pr", { prUrl: "not a url" })));
    expect(b.at(-1)).toMatchObject({ event: "error", data: { code: "INVALID_INPUT" } });
    expect((await verifyPr(post("/api/verify-pr", {}))).status).toBe(400);
  });

  it("replays the example repair loop FAIL → PASS", async () => {
    const ev = await events(await loop(post("/api/demo/loop")));
    expect(ev.filter((e) => e.event === "attempt").map((e) => e.data.overall)).toEqual(["FAIL", "PASS"]);
    expect(ev.some((e) => e.event === "repair")).toBe(true);
    expect(ev.at(-1)!.data.outcome).toBe("resolved");
  });
});

describe("OG images", () => {
  it("receipt and chain cards return image/png", async () => {
    const { default: receiptImage } = await import("../app/r/[id]/opengraph-image");
    const { default: chainImage } = await import("../app/c/[chainId]/opengraph-image");
    const first = await getStore().get("ex-toothless");
    const a = await receiptImage({ params: Promise.resolve({ id: "ex-toothless" }) });
    expect(a.headers.get("content-type")).toBe("image/png");
    const b = await chainImage({ params: Promise.resolve({ chainId: first!.receipt.chain.chainId }) });
    expect(b.headers.get("content-type")).toBe("image/png");
  });
});
