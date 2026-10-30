import { describe, expect, it } from "vitest";
import { computeChainId, MemoryChainStore } from "../src/loop/chain";
import { runLoop } from "../src/loop/driver";
import { overlap, parseRetractions } from "../src/loop/text";
import type { Receipt } from "../src/schema/receipt";

describe("retractions", () => {
  it("blanks the retraction but keeps offsets, and keeps the rest of the line", () => {
    const text = "Done.\nRetracted: All 13 tests pass. Deleted test/legacy.test.ts. 10 tests pass.";
    const r = parseRetractions(text);
    expect(r.quotes).toEqual(["All 13 tests pass"]);
    expect(r.stripped.length).toBe(text.length);
    expect(r.stripped).toContain("10 tests pass.");
    expect(r.stripped).not.toContain("13");
  });
  it("no retraction leaves the text alone", () => {
    expect(parseRetractions("Added tests.").stripped).toBe("Added tests.");
  });
});

describe("overlap", () => {
  it("is fuzzy at 0.8 and ignores punctuation and backticks", () => {
    expect(overlap("Added tests for `retry` backoff.", "added tests for retry backoff")).toBe(1);
    expect(overlap("All 13 tests pass", "Fixed the parser")).toBeLessThan(0.8);
  });
});

describe("computeChainId", () => {
  const parts = { repoRoot: "/r", baseSha: "a", agent: "x", taskId: null, sessionId: null, branch: "main" };
  it("is stable, 10 chars, and depends on the task id", () => {
    expect(computeChainId(parts)).toBe(computeChainId(parts));
    expect(computeChainId(parts)).toHaveLength(10);
    expect(computeChainId({ ...parts, taskId: "T1" })).not.toBe(computeChainId(parts));
  });
  it("memory store round-trips", async () => {
    const s = new MemoryChainStore();
    expect(await s.latest("x")).toBeNull();
  });
});

function fake(open: string[], overall: Receipt["overall"] = "FAIL"): Receipt {
  return {
    chain: { chainId: "abc", parentId: null, attempt: 1, outcome: "unresolved", items: open.map((k) => ({ key: k, quote: k, status: "open" as const, sinceAttempt: 1, resolvedAttempt: null })) },
    overall,
  } as unknown as Receipt;
}

describe("runLoop stop reasons", () => {
  const base = { writeRepair: async () => "/tmp/r.md" };
  it("resolved", async () => {
    const seq = [fake(["a"]), fake([], "PASS")];
    const r = await runLoop({ ...base, check: async () => ({ receipt: seq.shift() as Receipt, repair: { chainId: "abc", attempt: 1, overall: "FAIL", items: [], rules: [] } }), runAgent: async () => ({ exitCode: 0, summary: "s" }) }, "s0");
    expect(r.stopReason).toBe("resolved");
    expect(r.exitCode).toBe(0);
  });
  it("no progress after two identical open sets", async () => {
    const r = await runLoop({ ...base, check: async () => ({ receipt: fake(["a"]), repair: { chainId: "abc", attempt: 1, overall: "FAIL", items: [], rules: [] } }), runAgent: async () => ({ exitCode: 0, summary: "s" }) }, "s0", 5);
    expect(r.stopReason).toBe("no_progress");
    expect(r.receipts).toHaveLength(2);
    expect(r.exitCode).toBe(1);
  });
  it("max attempts", async () => {
    let n = 0;
    const r = await runLoop({ ...base, check: async () => ({ receipt: fake([`k${n++}`]), repair: { chainId: "abc", attempt: 1, overall: "FAIL", items: [], rules: [] } }), runAgent: async () => ({ exitCode: 0, summary: "s" }) }, "s0", 3);
    expect(r.stopReason).toBe("max_attempts");
    expect(r.receipts).toHaveLength(3);
  });
  it("a failing agent command is reported, not thrown", async () => {
    const r = await runLoop({ ...base, check: async () => ({ receipt: fake(["a"]), repair: { chainId: "abc", attempt: 1, overall: "FAIL", items: [], rules: [] } }), runAgent: async () => ({ exitCode: 3, summary: null }) }, "s0");
    expect(r.stopReason).toBe("agent_failed");
    expect(r.detail).toContain("3");
  });
});
