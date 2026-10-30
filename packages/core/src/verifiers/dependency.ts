import type { Claim } from "../schema/claim.js";
import type { Verdict } from "../schema/verdict.js";
import { contradicted, hunkEvidence, unverifiable, verified, type VerifyContext } from "./helpers.js";

const MANIFESTS = /(^|\/)(package\.json|requirements[^/]*\.txt|pyproject\.toml|Pipfile|go\.mod|Cargo\.toml)$/;
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function verifyDependency(claim: Claim, ctx: VerifyContext): Verdict {
  const name = claim.symbols[0] ?? claim.subject;
  if (!name) return unverifiable("The claim names no package.");
  const manifests = ctx.changeSet.files.filter((f) => MANIFESTS.test(f.path));
  const known = ctx.filesAtHead.some((p) => MANIFESTS.test(p));
  if (manifests.length === 0) {
    return known
      ? contradicted(`No dependency manifest changed, so '${name}' was not ${claim.type === "dependency_added" ? "added" : "removed"}.`)
      : unverifiable("No dependency manifest found in the repository.");
  }
  const re = new RegExp(`(^|[^\\w@/-])${escape(name)}(?![\\w-])`, "i");
  const want = claim.type === "dependency_added" ? "add" : "del";
  for (const manifest of manifests) {
    for (const hunk of ctx.changeSet.hunks.filter((h) => h.path === manifest.path)) {
      if (hunk.lines.some((l) => l.type === want && re.test(l.content))) {
        return verified(
          `${name} was ${want === "add" ? "added to" : "removed from"} ${manifest.path}.`,
          [hunkEvidence(hunk)],
        );
      }
    }
  }
  return contradicted(`${manifests.map((m) => m.path).join(", ")} changed but not for '${name}'.`);
}
