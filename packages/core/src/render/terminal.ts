import type { Receipt } from "../schema/receipt.js";

export interface TerminalOptions {
  color?: boolean;
}

const CODES = { red: 31, green: 32, yellow: 33, dim: 2, bold: 1 } as const;

export function renderTerminal(receipt: Receipt, opts: TerminalOptions = {}): string {
  const color = opts.color ?? false;
  const paint = (s: string, c: keyof typeof CODES) => (color ? `\u001b[${CODES[c]}m${s}\u001b[0m` : s);
  const out: string[] = [];
  const overallColor = receipt.overall === "PASS" ? "green" : receipt.overall === "FAIL" ? "red" : "yellow";
  out.push(paint(`nocap ${receipt.overall}`, overallColor), "");
  for (const { claim, verdict } of receipt.claims) {
    const mark =
      verdict.status === "verified" ? paint("✓", "green") : verdict.status === "contradicted" ? paint("✗", "red") : paint("!", "yellow");
    out.push(`${mark} ${claim.quote}`, paint(`    ${verdict.reason}`, "dim"));
    for (const f of verdict.flags) out.push(paint(`    ⚑ ${f.rule}: ${f.detail}`, "yellow"));
    if (verdict.repair) out.push(`    fix: ${verdict.repair}`);
  }
  for (const f of receipt.globalFlags) out.push(paint(`⚑ ${f.rule} ${f.path}: ${f.detail}`, "yellow"));
  if (receipt.undisclosed.length > 0) {
    out.push("", "Undisclosed changes:");
    for (const e of receipt.undisclosed) if (e.kind === "file") out.push(`  ${e.status} ${e.path}`);
  }
  const t = receipt.totals;
  out.push("", `${t.verified} verified, ${t.contradicted} contradicted, ${t.unverifiable} unverifiable, ${t.flags} flags`);
  return out.join("\n");
}
