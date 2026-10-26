import { describe, expect, it } from "vitest";
import type { Receipt } from "../src/schema/receipt";
import { aggregate, renderScorecard } from "../src/scorecard/aggregate";

type Status = "verified" | "contradicted" | "unverifiable";
function receipt(agent: string, model: string, statuses: Status[], opts: { chainId?: string; attempt?: number; overall?: Receipt["overall"]; outcome?: Receipt["chain"]["outcome"]; bite?: "bites" | "toothless"; dropped?: boolean } = {}): Receipt {
  return {
    actor: { agent, model, role: null },
    overall: opts.overall ?? "PASS",
    chain: {
      chainId: opts.chainId ?? `c-${Math.random()}`, attempt: opts.attempt ?? 1, outcome: opts.outcome ?? "first_attempt",
      items: opts.dropped ? [{ key: "k", quote: "q", status: "dropped_silently", sinceAttempt: 1, resolvedAttempt: null }] : [],
    },
    claims: statuses.map((status, i) => ({
      claim: { type: i === 0 && opts.bite ? "tests_added" : "file_modified" },
      verdict: { status, bitecheck: i === 0 && opts.bite ? { outcome: opts.bite } : null },
    })),
  } as unknown as Receipt;
}

describe("scorecard aggregation", () => {
  const rs = [
    receipt("opencode", "glm", ["verified", "verified"], { bite: "bites" }),
    receipt("opencode", "glm", ["verified", "verified"]),
    receipt("opencode", "glm", ["verified", "verified"]),
    receipt("opencode", "glm", ["verified", "contradicted"], { chainId: "x", attempt: 1, overall: "FAIL", outcome: "unresolved", bite: "toothless" }),
    receipt("opencode", "glm", ["verified", "verified"], { chainId: "x", attempt: 2, overall: "PASS", outcome: "resolved" }),
    receipt("opencode", "glm", ["unverifiable", "contradicted"], { overall: "FAIL", dropped: true }),
    receipt("claude-code", "opus", ["verified", "verified", "verified"]),
    receipt("claude-code", "opus", ["verified", "contradicted", "unverifiable"]),
  ];
  const rows = aggregate(rs);
  const glm = rows.find((r) => r.agent === "opencode");
  const opus = rows.find((r) => r.agent === "claude-code");

  it("gives exact percentages once n >= 10", () => {
    expect(glm).toMatchObject({ claims: 12, verifiedPct: 75, contradictedPct: 16.7, unverifiablePct: 8.3, silentDrops: 1 });
  });
  it("bite rate, repair success and attempts", () => {
    expect(glm?.biteRate).toBe(50);
    expect(glm?.repairSuccess).toBe(50); // chains with a FAIL: x (resolved) and the dropped one (not)
    expect(glm?.avgAttemptsToResolve).toBe(2);
  });
  it("shows n/a under 10 claims and carries the caption", () => {
    expect(opus?.verifiedPct).toBeNull();
    const text = renderScorecard(rows);
    expect(text).toContain("n/a (n=6)");
    expect(text).toContain("self-reported runs, not a model benchmark");
    expect(text).toContain("75%");
  });
});
