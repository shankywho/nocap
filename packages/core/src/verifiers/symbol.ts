import type { Claim } from "../schema/claim.js";
import type { Verdict } from "../schema/verdict.js";
import { contradicted, hunkEvidence, unverifiable, verified, type VerifyContext } from "./helpers.js";

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const isTs = (p: string) => /\.(ts|tsx|js|jsx|mjs|cjs)$/.test(p);

function declares(source: string, name: string): boolean {
  const n = escape(name);
  const patterns = [
    new RegExp(`\\b(?:function|class|interface|type|enum|const|let|var)\\s+${n}\\b`),
    new RegExp(`^\\s*(?:export\\s+)?(?:async\\s+)?(?:static\\s+)?${n}\\s*[(<]`, "m"),
    new RegExp(`\\bdef\\s+${n}\\b`),
  ];
  return patterns.some((re) => re.test(source));
}

export async function verifySymbol(claim: Claim, ctx: VerifyContext): Promise<Verdict> {
  const name = claim.symbols[0];
  if (!name) return unverifiable("The claim names no identifier to look for.");
  const re = new RegExp(`\\b${escape(name)}\\b`);
  const added = ctx.changeSet.hunks.filter((h) => h.lines.some((l) => l.type === "add" && re.test(l.content)));

  if (added.length === 0) {
    for (const file of ctx.changeSet.files) {
      if (file.status === "D") continue;
      const text = await ctx.readFileAtHead(file.path);
      if (text !== null && re.test(text)) {
        return unverifiable(`'${name}' exists in ${file.path} but not on an added line.`);
      }
    }
    return contradicted(`'${name}' does not appear in any changed file.`);
  }

  const [first] = added;
  if (!first) return unverifiable("No hunk found.");
  const evidence = added.slice(0, 2).map((h) => hunkEvidence(h));
  const tsPaths = added.map((h) => h.path).filter(isTs);
  if (tsPaths.length === 0) {
    return verified(`'${name}' appears in added lines (text match).`, [...evidence, { kind: "note", text: "text match" }]);
  }
  for (const path of tsPaths) {
    const text = await ctx.readFileAtHead(path);
    if (text !== null && declares(text, name)) {
      return verified(`'${name}' is declared in ${path}.`, evidence);
    }
  }
  return verified(`'${name}' appears in added lines of ${tsPaths[0]} (referenced, declaration not located).`, [
    ...evidence,
    { kind: "note", text: "text match" },
  ]);
}
