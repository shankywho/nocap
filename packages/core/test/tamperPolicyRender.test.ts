import { describe, expect, it } from "vitest";
import type { ChangeSet, DiffHunk } from "../src/git/types.js";
import { tamperFlags } from "../src/tamper/rules.js";
import { countIntegrity } from "../src/tamper/countIntegrity.js";
import { overallPolicy } from "../src/policy/overall.js";
import { buildRepairPacket, repairMarkdown, repairText } from "../src/policy/repair.js";
import { renderMarkdown } from "../src/render/markdown.js";
import { renderTerminal } from "../src/render/terminal.js";
import { renderJson } from "../src/render/json.js";
import { Receipt } from "../src/schema/receipt.js";
import type { Claim } from "../src/schema/claim.js";
import type { Verdict } from "../src/schema/verdict.js";

function cs(path: string, adds: string[], dels: string[] = [], status: "M" | "D" = "M"): ChangeSet {
  const hunk: DiffHunk = {
    path, oldStart: 1, newStart: 1,
    lines: [
      ...dels.map((c, i) => ({ type: "del" as const, content: c, oldLine: i + 1, newLine: null })),
      ...adds.map((c, i) => ({ type: "add" as const, content: c, oldLine: null, newLine: i + 1 })),
    ],
  };
  return { baseSha: "a", headSha: "b", files: [{ path, status, additions: adds.length, deletions: dels.length, previousPath: null, isBinary: false }], hunks: [hunk] };
}
const rules = (c: ChangeSet) => tamperFlags(c).map((f) => f.rule);

describe("tamper rules", () => {
  const T = "test/a.test.ts";
  it.each([
    ["skip_added", cs(T, ["it.skip('x', () => {})"]), cs(T, ["it('x', () => {})"])],
    ["skip_added", cs("tests/t.py", ["@pytest.mark.skip"]), cs("tests/t.py", ["@pytest.mark.skipif(x)"])],
    ["only_added", cs(T, ["it.only('x', f)"]), cs(T, ["it('x', f)"])],
    ["assertions_removed", cs(T, [], ["expect(a)", "expect(b)"]), cs(T, ["expect(a)"], ["expect(b)"])],
    ["assertion_loosened", cs(T, ["expect(a).toBeTruthy()"], ["expect(a).toEqual(1)"]), cs(T, ["expect(a).toEqual(2)"], ["expect(a).toEqual(1)"])],
    ["trivial_assertion", cs(T, ["expect(true).toBe(true)"]), cs(T, ["expect(a).toBe(true)"])],
    ["test_file_deleted", cs(T, [], [], "D"), cs(T, ["x"])],
    ["test_config_changed", cs("vitest.config.ts", ["exclude: ['a']"]), cs("vitest.config.ts", ["include: ['a']"])],
    ["forced_exit", cs(T, ["process.exit(0)"]), cs(T, ["process.exitCode = 1"])],
    ["env_sniffing", cs("src/a.ts", ["if (process.env.VITEST) {}"]), cs(T, ["if (process.env.VITEST) {}"])],
    ["eq_override", cs("src/a.py", ["def __eq__(self, o): return True"]), cs("src/a.py", ["def __ne__(self): pass"])],
  ])("%s", (rule, positive, negative) => {
    expect(rules(positive)).toContain(rule);
    expect(rules(negative)).not.toContain(rule);
  });
  it("snapshot_mass_update needs 3 snapshots", () => {
    const mk = (n: number): ChangeSet => ({
      baseSha: "a", headSha: "b", hunks: [],
      files: Array.from({ length: n }, (_, i) => ({ path: `__snapshots__/${i}.snap`, status: "M" as const, additions: 1, deletions: 1, previousPath: null, isBinary: false })),
    });
    expect(rules(mk(3))).toContain("snapshot_mass_update");
    expect(rules(mk(2))).not.toContain("snapshot_mass_update");
  });
});

describe("countIntegrity", () => {
  const set = cs("test/a.test.ts", []);
  const decl = (n: number) => Array.from({ length: n }, (_, i) => `it('t${i}', () => {})`).join("\n");
  const run = (b: number, h: number, summary = "done") =>
    countIntegrity({ changeSet: set, summary, readAtBase: async () => decl(b), readAtHead: async () => decl(h) });
  it("flags 12 → 9", async () => {
    const r = await run(12, 9);
    expect(r.flag?.detail).toBe("12 → 9 test declarations");
  });
  it("does not flag head >= base or an announced removal", async () => {
    expect((await run(9, 9)).flag).toBeNull();
    expect((await run(9, 12)).flag).toBeNull();
    expect((await run(12, 9, "Removed the obsolete tests")).flag).toBeNull();
  });
});

const claim: Claim = { id: "c1", quote: "Added tests for retry", type: "tests_added", subject: "retry", keywords: [], paths: [], symbols: [], count: null, command: null, span: null };
const bad: Verdict = {
  status: "contradicted", reason: "toothless", evidence: [], flags: [], repair: null,
  bitecheck: { outcome: "toothless", mode: "revert", stubbed: [], selectedTests: [{ file: "test/retry.test.ts", title: "t" }], revertedFiles: ["src/retry.ts"], deletedForRevert: [], head: null, reverted: null },
};
const ok: Verdict = { status: "verified", reason: "fine", evidence: [], flags: [], bitecheck: null, repair: null };
const warn: Verdict = { ...ok, flags: [{ rule: "skip_added", severity: "warn", path: "a", line: 1, detail: "d" }] };

describe("overall policy", () => {
  const file = (path: string) => ({ kind: "file" as const, path, status: "M" as const, additions: 1, deletions: 0, previousPath: null });
  it("FAIL / MIXED / PASS", () => {
    expect(overallPolicy([bad, ok], [], [])).toBe("FAIL");
    expect(overallPolicy([{ ...ok, status: "unverifiable" }], [], [])).toBe("MIXED");
    expect(overallPolicy([warn], [], [])).toBe("MIXED");
    expect(overallPolicy([ok], [], [file("test/x.test.ts")])).toBe("MIXED");
    expect(overallPolicy([ok], [], [file("src/x.ts")])).toBe("PASS");
  });
});

describe("repair", () => {
  it("toothless template", () => {
    expect(repairText(claim, bad)).toMatchInlineSnapshot(
      `"Your tests in \`test/retry.test.ts\` still pass with your change to \`src/retry.ts\` reverted, so they don't exercise it. Add assertions that depend on the new behaviour, then run nocap again."`,
    );
  });
  it("only contradicted claims get a repair", () => {
    expect(repairText(claim, ok)).toBeNull();
  });
  it("packet lists only ✗ items", () => {
    const p = buildRepairPacket("abc", 1, "FAIL", [{ claim, verdict: bad }, { claim: { ...claim, id: "c2" }, verdict: ok }]);
    expect(p.items.map((i) => i.key)).toEqual(["c1"]);
    expect(repairMarkdown(p)).toContain("Retracted");
  });
});

describe("renderers", () => {
  const receipt = Receipt.parse({
    schemaVersion: 1, id: "r1", runId: "run1", createdAt: "2026-10-26T00:00:00Z",
    input: { mode: "local", agent: "x", summary: "s", repo: null, pr: null, base: "a", head: "b", headIsSnapshot: false, alan: null },
    chain: { chainId: "c", parentId: null, attempt: 1, items: [], outcome: "first_attempt" },
    actor: { agent: "x", model: null, role: null },
    claims: [{ claim, verdict: { ...bad, repair: "Add assertions." } }],
    undisclosed: [], globalFlags: [], totals: { verified: 0, contradicted: 1, unverifiable: 0, flags: 0 },
    overall: "FAIL", model: null, trace: [], durationMs: 5, tool: { name: "nocap", version: "0.1.0" },
  });
  it("terminal without colour has no escape codes", () => {
    const out = renderTerminal(receipt);
    expect(out).not.toContain("\u001b");
    expect(out).toContain('✗ CONTRADICTED  "Added tests for retry"');
    expect(renderTerminal(receipt, { color: true })).toContain("\u001b[31m");
  });
  it("markdown and json", () => {
    expect(renderMarkdown(receipt)).toContain("### ✗ Added tests for retry");
    expect(Receipt.parse(JSON.parse(renderJson(receipt))).overall).toBe("FAIL");
  });
});
