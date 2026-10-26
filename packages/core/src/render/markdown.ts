import type { Evidence } from "../schema/evidence.js";
import type { Receipt } from "../schema/receipt.js";

const ICON = { verified: "✓", contradicted: "✗", unverifiable: "!" } as const;

function evidenceLine(e: Evidence): string {
  switch (e.kind) {
    case "file":
      return `${e.status} \`${e.path}\` (+${e.additions} −${e.deletions})`;
    case "hunk":
      return `hunk \`${e.path}:${e.startLine}\``;
    case "mapping":
      return `scope '${e.concept}' → ${e.globs.join(", ")} (${e.matchedFiles} files, ${e.source})`;
    case "testRun":
      return `${e.label} run: ${e.passed}/${e.total} passed, ${e.failed} failed (${e.runner})`;
    case "command":
      return `\`${e.command}\` exit ${e.exitCode}`;
    case "checkRuns":
      return `checks: ${e.success} ok, ${e.failure} failed, ${e.pending} pending`;
    case "note":
      return e.text;
  }
}

export function renderMarkdown(receipt: Receipt): string {
  const t = receipt.totals;
  const lines = [
    `## nocap: ${receipt.overall}`,
    "",
    `${t.verified} verified · ${t.contradicted} contradicted · ${t.unverifiable} unverifiable · ${t.flags} flags`,
    "",
  ];
  for (const { claim, verdict } of receipt.claims) {
    lines.push(`### ${ICON[verdict.status]} ${claim.quote}`, verdict.reason);
    for (const e of verdict.evidence) lines.push(`- ${evidenceLine(e)}`);
    for (const f of verdict.flags) lines.push(`- ⚑ \`${f.rule}\` ${f.path}${f.line ? `:${f.line}` : ""}: ${f.detail}`);
    if (verdict.repair) lines.push("", `> Fix: ${verdict.repair}`);
    lines.push("");
  }
  if (receipt.globalFlags.length > 0) {
    lines.push("### Flags");
    for (const f of receipt.globalFlags) lines.push(`- \`${f.rule}\` ${f.path}${f.line ? `:${f.line}` : ""}: ${f.detail}`);
    lines.push("");
  }
  if (receipt.undisclosed.length > 0) {
    lines.push("### Undisclosed changes");
    for (const e of receipt.undisclosed) lines.push(`- ${evidenceLine(e)}`);
    lines.push("");
  }
  lines.push(`_nocap ${receipt.tool.version} · run ${receipt.runId}_`);
  return lines.join("\n");
}
