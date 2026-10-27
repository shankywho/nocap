import type { Claim } from "../schema/claim.js";
import type { Evidence } from "../schema/evidence.js";
import type { Verdict } from "../schema/verdict.js";
import { isTestPath } from "../git/classify.js";
import { contradicted, fileEvidence, unverifiable, verified, type VerifyContext } from "./helpers.js";

const noExec = (what: string) => unverifiable(`${what} needs execution, which is disabled (--no-exec).`);

export function suiteEvidence(ctx: VerifyContext): Evidence[] {
  const s = ctx.suite;
  if (!s) return [];
  return [
    {
      kind: "testRun",
      label: "suite",
      runner: s.runner,
      total: s.total,
      passed: s.passed,
      failed: s.failed,
      skipped: s.skipped,
      durationMs: s.durationMs,
      // failures first, so they are always in the evidence even when the suite is large
      tests: [...s.tests.filter((t) => t.status === "failed"), ...s.tests.filter((t) => t.status !== "failed")].slice(0, 50).map((t) => ({ file: t.file, title: t.title, status: t.status })),
    },
  ];
}

export function verifyTestsPass(claim: Claim, ctx: VerifyContext): Verdict {
  if (!ctx.execEnabled) return noExec("Re-running the suite");
  const s = ctx.suite;
  if (!s || s.environmentError) return unverifiable(s?.environmentError ?? "No test runner was detected.");
  const ev = suiteEvidence(ctx);
  if (s.failed > 0) return contradicted(`${s.failed} of ${s.total} tests fail on head.`, ev);
  if (claim.count !== null && claim.count !== s.total) {
    return contradicted(`The summary reports ${claim.count} passing tests but the suite collects ${s.total}.`, ev);
  }
  return verified(`${s.passed}/${s.total} tests pass on head.`, ev);
}

function fromBitecheck(claim: Claim, ctx: VerifyContext, kind: "added" | "fixed"): Verdict {
  if (!ctx.execEnabled) return noExec(kind === "added" ? "Reverting the change to test the tests" : "Reverting the fix");
  const bc = ctx.bitechecks.get(claim.id);
  if (!bc) return unverifiable("No Bitecheck result is available for this claim.");
  const ev = [bc.head, bc.reverted].filter((e): e is Evidence => e !== null);
  const opts = { bitecheck: bc };
  switch (bc.outcome) {
    case "bites":
      return verified(bc.mode === "stub" ? "The tests pass on head and fail when the added functions are stubbed to return undefined." : "The tests pass on head and fail with the source change reverted.", ev, opts);
    case "import_only":
      return kind === "added"
        ? verified("Tests bite (weak: fails only at import).", ev, opts)
        : unverifiable("The tests fail on revert only at import, which does not prove the fix.", ev);
    case "toothless":
      return kind === "added"
        ? { ...contradicted(bc.mode === "stub" ? "The tests still pass with the added functions stubbed to return undefined, so they only check that the functions exist." : "The tests still pass with the source change reverted, so they do not exercise it.", ev, opts) }
        : unverifiable("Matching tests pass without the fix, so they do not prove it.", ev);
    case "broken_on_head":
      return contradicted("The claimed tests fail on head.", ev, opts);
    case "no_matching_tests": {
      const testsChanged = ctx.changeSet.files.some((f) => isTestPath(f.path));
      if (kind === "fixed") return unverifiable(`No regression test found for '${claim.subject ?? "this fix"}'.`);
      return testsChanged
        ? unverifiable("Test files changed but none match the claim.", ev)
        : contradicted("No test files were changed.", ev, opts);
    }
    default:
      return unverifiable("The Bitecheck could not run in this environment.", ev);
  }
}

export const verifyTestsAdded = (claim: Claim, ctx: VerifyContext) => fromBitecheck(claim, ctx, "added");
export const verifyBugFixed = (claim: Claim, ctx: VerifyContext) => fromBitecheck(claim, ctx, "fixed");

export function verifyRefactor(_claim: Claim, ctx: VerifyContext): Verdict {
  const tests = ctx.changeSet.files.filter((f) => isTestPath(f.path));
  if (tests.length > 0) {
    return contradicted(`Test files changed in a "no behaviour change" refactor: ${tests.map((t) => t.path).join(", ")}.`, tests.map(fileEvidence));
  }
  if (!ctx.execEnabled) return noExec("Confirming the suite still passes");
  const s = ctx.suite;
  if (!s || s.environmentError) return unverifiable(s?.environmentError ?? "No test runner was detected.");
  return s.failed > 0
    ? contradicted(`No tests changed but ${s.failed} now fail.`, suiteEvidence(ctx))
    : verified("No test files changed and the suite passes.", suiteEvidence(ctx));
}

export function verifyBuild(claim: Claim, ctx: VerifyContext): Verdict {
  if (!ctx.execEnabled) return noExec("Running the command");
  const run = claim.command ? ctx.commands.get(claim.command) : undefined;
  if (!run) return unverifiable(`Command '${claim.command ?? "unknown"}' was not run.`);
  const ev: Evidence = { kind: "command", command: run.command, exitCode: run.exitCode, durationMs: run.durationMs, stderrTail: run.stderrTail.slice(-2000) };
  return run.exitCode === 0 ? verified(`${run.command} exited 0.`, [ev]) : contradicted(`${run.command} exited ${run.exitCode}.`, [ev]);
}
