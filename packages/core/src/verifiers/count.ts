import type { Claim } from "../schema/claim.js";
import type { Verdict } from "../schema/verdict.js";
import { contradicted, unverifiable, verified, type VerifyContext } from "./helpers.js";

export function verifyCount(claim: Claim, ctx: VerifyContext): Verdict {
  if (claim.count === null) return unverifiable("The claim gives no number to check.");
  const actual = ctx.changeSet.files.length;
  const tolerance = Math.max(1, Math.floor(actual * 0.1));
  const note = { kind: "note" as const, text: `claimed ${claim.count}, actual ${actual}, tolerance ±${tolerance}` };
  return Math.abs(claim.count - actual) <= tolerance
    ? verified(`Claimed ${claim.count} files changed; actual is ${actual}.`, [note])
    : contradicted(`Claimed ${claim.count} files changed but ${actual} did.`, [note]);
}
