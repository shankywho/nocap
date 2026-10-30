import { undisclosedView } from "./undisclosed.js";
import type { Evidence } from "../schema/evidence.js";
import type { Receipt } from "../schema/receipt.js";
import type { Verdict } from "../schema/verdict.js";

export interface TerminalOptions {
  color?: boolean;
  width?: number;
}

const CODES = { red: 31, green: 32, yellow: 33, dim: 2, bold: 1 } as const;
const LABEL = { verified: "✓ VERIFIED", contradicted: "✗ CONTRADICTED", unverifiable: "! UNVERIFIABLE" } as const;
const INDENT = " ".repeat(16);

function evidenceLines(verdict: Verdict): string[] {
  const lines: string[] = [];
  const bc = verdict.bitecheck;
  if (bc && (bc.outcome === "toothless" || bc.outcome === "bites" || bc.outcome === "import_only")) {
    const re = bc.reverted;
    const n = re && re.kind === "testRun" ? re : null;
    const what = bc.mode === "stub" ? `stubbed ${bc.stubbed.map((x) => x.split(" › ")[1]).join(", ")}()` : `reverted ${bc.revertedFiles.concat(bc.deletedForRevert).join(", ") || "source"}`;
    const tag = bc.mode === "stub" ? " (stub)" : "";
    if (bc.outcome === "toothless" && n) {
      lines.push(`BITECHECK${tag} ${what} → ${n.passed}/${n.total} matching tests STILL PASS`, "these tests don't exercise your change");
    } else if (n) {
      lines.push(`BITECHECK${tag} ${what} → ${n.failed}/${n.total} matching tests fail${bc.outcome === "import_only" ? " (weak: fails only at import)" : ""}`);
    }
    return lines;
  }
  const first = verdict.evidence.find((e): e is Extract<Evidence, { kind: "file" }> => e.kind === "file");
  const map = verdict.evidence.find((e): e is Extract<Evidence, { kind: "mapping" }> => e.kind === "mapping");
  if (map && first) lines.push(`${map.concept} → ${map.globs.join(", ")} · ${first.path}  ${first.status} +${first.additions} −${first.deletions}`);
  else if (first) lines.push(`${first.path}  ${first.status} +${first.additions} −${first.deletions}`);
  const run = verdict.evidence.find((e): e is Extract<Evidence, { kind: "testRun" }> => e.kind === "testRun" && e.label === "suite");
  if (run) lines.push(`${run.passed}/${run.total} passed · ${run.runner} · ${(run.durationMs / 1000).toFixed(1)}s`);
  const cmd = verdict.evidence.find((e): e is Extract<Evidence, { kind: "command" }> => e.kind === "command");
  if (cmd) lines.push(`${cmd.command} → exit ${cmd.exitCode}`);
  if (lines.length === 0) lines.push(verdict.reason);
  else if (verdict.status !== "verified") lines.push(verdict.reason);
  return lines;
}

export function renderTerminal(receipt: Receipt, opts: TerminalOptions = {}): string {
  const color = opts.color ?? false;
  const width = opts.width ?? 78;
  const paint = (s: string, c: keyof typeof CODES) => (color ? `\u001b[${CODES[c]}m${s}\u001b[0m` : s);
  const rule = paint("─".repeat(width), "dim");
  const out: string[] = [];
  const range = `${receipt.input.base.slice(0, 7)} → ${receipt.input.headIsSnapshot ? "working tree (snapshot " : "("}${receipt.input.head.slice(0, 7)})`;
  out.push(`${paint("NOCAP", "bold")}  receipt ${receipt.id}  ·  agent: ${receipt.input.agent}  ·  base ${range}`, rule);

  for (const { claim, verdict } of receipt.claims) {
    const tone = verdict.status === "verified" ? "green" : verdict.status === "contradicted" ? "red" : "yellow";
    const [first, ...rest] = evidenceLines(verdict);
    out.push(`${paint(LABEL[verdict.status].padEnd(15), tone)} "${claim.quote.replace(/\.$/, "")}"`);
    if (first) out.push(paint(`${INDENT}${first}`, "dim"));
    for (const line of rest) out.push(paint(`${INDENT}${line}`, "dim"));
    for (const f of verdict.flags) {
      out.push(paint(`${INDENT}! ${f.rule.replace(/_/g, " ")}  ${f.path}${f.line ? `:${f.line}` : ""}  ${f.detail}`, "yellow"));
    }
  }
  for (const f of receipt.globalFlags) {
    out.push(paint(`${"FLAG".padEnd(15)} ${f.rule.replace(/_/g, " ")}  ${f.path}${f.line ? `:${f.line}` : ""}  ${f.detail}`, "yellow"));
  }
  out.push(rule);
  const undisclosed = undisclosedView(receipt.undisclosed);
  for (const e of undisclosed.files) {
    out.push(`${"UNDISCLOSED".padEnd(15)} ${e.path}  ${e.status} +${e.additions} −${e.deletions}   (changed, never mentioned)`);
  }
  if (undisclosed.more > 0) out.push(paint(`${" ".repeat(16)}…and ${undisclosed.more} more (see receipt JSON)`, "dim"));
  if (undisclosed.lockfiles.length > 0) out.push(paint(`${"".padEnd(15)} lockfile changed (${undisclosed.lockfiles.join(", ")})`, "dim"));
  const t = receipt.totals;
  const live = receipt.model && !receipt.model.degraded && receipt.model.provider !== "offline";
  const model = live && receipt.model ? ` · ${receipt.model.id.split("/").pop()}@${receipt.model.provider}` : " · offline";
  out.push(
    `${"RESULT".padEnd(15)} ${paint(receipt.overall, receipt.overall === "PASS" ? "green" : receipt.overall === "FAIL" ? "red" : "yellow")} · ${t.verified} verified · ${t.contradicted} contradicted · ${t.unverifiable} unverifiable · ${(receipt.durationMs / 1000).toFixed(1)}s${model}`,
  );
  if (t.contradicted > 0) out.push("Repair: run `nocap check --repair` to print fix instructions for your agent.");
  return out.join("\n");
}
