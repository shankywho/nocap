import type { Claim } from "../schema/claim.js";
import type { Verdict } from "../schema/verdict.js";

const RULES = [
  "Do not delete, skip or weaken tests to resolve an item.",
  "If a claim was wrong and you will not fix it, write 'Retracted: <original quote>' in your next summary.",
  "Restate every original claim you still stand behind in your next summary.",
];

const filesOf = (v: Verdict) => v.evidence.flatMap((e) => (e.kind === "file" ? [e] : []));

/** Deterministic, at most three sentences, no LLM. */
export function repairText(claim: Claim, verdict: Verdict): string | null {
  if (verdict.status !== "contradicted") return null;
  const files = filesOf(verdict);
  const first = files[0];
  switch (claim.type) {
    case "tests_added": {
      const bc = verdict.bitecheck;
      const test = bc?.selectedTests[0]?.file ?? "the new test file";
      if (bc?.outcome === "toothless" && bc.mode === "stub") {
        const fns = bc.stubbed.map((x) => x.split(" › ")[1]).join(", ");
        return `Your tests in \`${test}\` still pass when the body of ${fns} is replaced with \`return undefined\`, so they only check that it exists. Assert on what it returns, then run nocap again.`;
      }
      if (bc?.outcome === "toothless") {
        const src = bc.revertedFiles.join(", ") || "your source change";
        return `Your tests in \`${test}\` still pass with your change to \`${src}\` reverted, so they don't exercise it. Add assertions that depend on the new behaviour, then run nocap again.`;
      }
      if (bc?.outcome === "broken_on_head") return `The tests in \`${test}\` fail on your current code. Fix them or the code, then run nocap again.`;
      return "No test files were changed. Add tests that fail without your change, then run nocap again.";
    }
    case "scope_none":
      return first
        ? `You said you didn't touch ${claim.subject ?? "that area"}, but \`${first.path}\` changed (+${first.additions} −${first.deletions}). Revert that change or explain it in your summary.`
        : "Revert the out-of-scope change or explain it in your summary.";
    case "scope_only":
      return `You said you only changed ${claim.subject ?? "one area"}, but ${files.map((f) => `\`${f.path}\``).slice(0, 3).join(", ")} also changed. Revert them or mention them in your summary.`;
    case "tests_pass": {
      const run = verdict.evidence.find((e) => e.kind === "testRun");
      if (run && run.failed === 0 && claim.count !== null) {
        return `You reported ${claim.count} passing tests but the suite collects ${run.total}. Restore any deleted tests or state the deletion explicitly.`;
      }
      return `${run?.failed ?? "Some"} tests fail. Fix them before reporting that the suite passes.`;
    }
    case "build_pass":
      return `\`${claim.command ?? "The command"}\` fails. Fix the errors and run it again before claiming it passes.`;
    case "refactor_no_behavior_change":
      return "Tests changed or the suite fails, so this was not behaviour-neutral. Revert test edits or describe the behaviour change in your summary.";
    case "version_bumped":
      return `${verdict.reason} Bump the version in package.json (or the project's version file) to ${claim.subject ?? "the new version"}, or remove the claim.`;
    case "bug_fixed":
      return "The test for this fix fails on your current code. Make it pass, then run nocap again.";
    default:
      return `${verdict.reason} Correct the code or restate the claim accurately in your next summary.`;
  }
}

export interface RepairItem {
  key: string;
  quote: string;
  problem: string;
  evidence: string;
  instruction: string;
  doneWhen: string;
}

export interface RepairPacket {
  chainId: string;
  attempt: number;
  overall: string;
  items: RepairItem[];
  rules: string[];
}

export function buildRepairPacket(
  chainId: string,
  attempt: number,
  overall: string,
  claims: { claim: Claim; verdict: Verdict }[],
  chainItems: { key: string; quote: string; status: string }[] = [],
): RepairPacket {
  const items: RepairItem[] = claims
    .filter(({ verdict }) => verdict.status === "contradicted")
    .map(({ claim, verdict }) => ({
      key: chainItems.find((i) => overlapKey(i.quote, claim.quote))?.key ?? claim.id,
      quote: claim.quote,
      problem: verdict.bitecheck?.outcome ?? claim.type,
      evidence: verdict.reason,
      instruction: verdict.repair ?? repairText(claim, verdict) ?? verdict.reason,
      doneWhen: doneWhen(claim),
    }));
  for (const item of chainItems) {
    if (item.status !== "dropped_silently" && item.status !== "repair_by_weakening") continue;
    if (items.some((i) => i.key === item.key)) continue;
    items.push({
      key: item.key,
      quote: item.quote,
      problem: item.status,
      evidence:
        item.status === "dropped_silently"
          ? "This claim disappeared from your summary without a retraction."
          : "The claim now looks satisfied only because tests were weakened.",
      instruction:
        item.status === "dropped_silently"
          ? `Either do the work and restate "${item.quote}", or write 'Retracted: ${item.quote}' in your summary.`
          : "Restore the removed or loosened tests, then fix the code so they pass.",
      doneWhen: `nocap check → "${item.quote}" is verified, or retracted`,
    });
  }
  return { chainId, attempt, overall, items, rules: RULES };
}

const overlapKey = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

function doneWhen(claim: Claim): string {
  switch (claim.type) {
    case "tests_added":
    case "bug_fixed":
      return `nocap check → "${claim.quote}" is verified (outcome=bites)`;
    default:
      return `nocap check → "${claim.quote}" is verified`;
  }
}

export function repairMarkdown(packet: RepairPacket): string {
  const lines = [`# nocap repair packet (chain ${packet.chainId}, attempt ${packet.attempt}, ${packet.overall})`, ""];
  for (const item of packet.items) {
    lines.push(`## ✗ ${item.quote}`, `- Problem: ${item.problem}`, `- Evidence: ${item.evidence}`, `- Do: ${item.instruction}`, `- Done when: ${item.doneWhen}`, "");
  }
  lines.push("## Rules", ...packet.rules.map((r) => `- ${r}`));
  return lines.join("\n");
}
