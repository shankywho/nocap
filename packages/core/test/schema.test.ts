import { describe, expect, it } from "vitest";
import { Claim, Evidence, Flag, Receipt, Verdict } from "@nocap/core";

const claim = {
  id: "c1",
  quote: "Added tests for the retry backoff",
  type: "tests_added",
  subject: "retry backoff",
  keywords: ["retry", "backoff"],
  paths: ["test/retry.test.ts"],
  symbols: [],
  count: null,
  command: null,
  span: [0, 34],
};

const verdict = {
  status: "verified",
  reason: "reverted src/retry.ts → 2/2 tests fail",
  evidence: [
    {
      kind: "file",
      path: "test/retry.test.ts",
      status: "M",
      additions: 12,
      deletions: 0,
      previousPath: null,
    },
  ],
  flags: [],
  bitecheck: null,
  repair: null,
};

const receipt = {
  schemaVersion: 1,
  id: "k3f9a2",
  runId: "run-1",
  createdAt: "2026-10-26T13:00:00.000Z",
  input: {
    mode: "local",
    agent: "claude-code",
    summary: "Added tests for the retry backoff",
    repo: null,
    pr: null,
    base: "a1b2c3d",
    head: "9e8f7a6",
    headIsSnapshot: true,
    alan: null,
  },
  chain: {
    chainId: "abc123",
    parentId: null,
    attempt: 1,
    items: [],
    outcome: "first_attempt",
  },
  actor: { agent: "claude-code", model: null, role: null },
  claims: [{ claim, verdict }],
  undisclosed: [],
  globalFlags: [],
  totals: { verified: 1, contradicted: 0, unverifiable: 0, flags: 0 },
  overall: "PASS",
  model: null,
  trace: [{ step: "resolve", ms: 4, status: "ok", detail: "base a1b2c3d" }],
  durationMs: 1200,
  tool: { name: "nocap", version: "0.1.0" },
};

describe("claim and verdict schemas", () => {
  it("accepts a complete claim", () => {
    expect(Claim.parse(claim).type).toBe("tests_added");
  });

  it("rejects an unknown claim type", () => {
    expect(() => Claim.parse({ ...claim, type: "vibes" })).toThrow();
  });

  it("accepts a bitecheck evidence payload", () => {
    const evidence = Evidence.parse({
      kind: "testRun",
      label: "reverted",
      runner: "vitest",
      total: 2,
      passed: 0,
      failed: 2,
      skipped: 0,
      durationMs: 340,
      tests: [{ file: "test/retry.test.ts", title: "backs off", status: "failed" }],
    });
    expect(evidence.kind).toBe("testRun");
  });

  it("requires a reason on a verdict", () => {
    expect(() => Verdict.parse({ ...verdict, reason: undefined })).toThrow();
  });

  it("parses flags with a known severity", () => {
    expect(
      Flag.parse({
        rule: "skip_added",
        severity: "warn",
        path: "a.test.ts",
        line: 4,
        detail: "it.skip",
      }).rule,
    ).toBe("skip_added");
  });
});

describe("receipt schema", () => {
  it("parses a complete receipt", () => {
    expect(Receipt.parse(receipt).overall).toBe("PASS");
  });

  it("rejects a receipt with the wrong schema version", () => {
    expect(() => Receipt.parse({ ...receipt, schemaVersion: 2 })).toThrow();
  });

  it("strips unknown fields when publishing", () => {
    const parsed = Receipt.parse({ ...receipt, extra: "ignored" });
    expect("extra" in parsed).toBe(false);
  });
});
