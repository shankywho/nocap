import picomatch from "picomatch";
import type { Claim } from "../schema/claim.js";
import type { Verdict } from "../schema/verdict.js";
import { isLockPath } from "../git/classify.js";
import {
  claimConcept,
  contradicted,
  fileEvidence,
  hunkEvidence,
  mappingEvidence,
  unverifiable,
  verified,
  type VerifyContext,
} from "./helpers.js";

export function verifyScope(claim: Claim, ctx: VerifyContext): Verdict {
  const concept = claimConcept(claim);
  const mapping = ctx.mappings.get(concept);
  if (!mapping || mapping.globs.length === 0 || mapping.matchedFiles.length === 0) {
    return unverifiable(`Could not map '${concept || "the scope"}' to any file, so the claim cannot be checked.`);
  }
  const source = mapping.globs.length > 0 && claim.paths.length > 0 ? "user" : "keyword";
  const mapEv = mappingEvidence(mapping, source);
  const match = picomatch(mapping.globs, { dot: true });
  const inScope = (path: string) => match(path) || mapping.matchedFiles.includes(path);
  const changed = ctx.changeSet.files;

  if (claim.type === "scope_none") {
    const hit = changed.filter((f) => inScope(f.path) || (f.previousPath !== null && inScope(f.previousPath)));
    if (hit.length === 0) return verified(`No file mapped to '${concept}' changed.`, [mapEv]);
    const first = hit[0];
    const hunks = ctx.changeSet.hunks.filter((h) => h.path === first?.path).slice(0, 3).map((h) => hunkEvidence(h));
    return contradicted(
      `${hit.map((f) => f.path).join(", ")} changed although the summary says '${concept}' was untouched.`,
      [mapEv, ...hit.map(fileEvidence), ...hunks],
    );
  }

  const outside = changed.filter((f) => !isLockPath(f.path) && !inScope(f.path));
  if (outside.length === 0) return verified(`Every changed file falls under '${concept}'.`, [mapEv]);
  return contradicted(
    `${outside.length} file(s) changed outside '${concept}': ${outside.map((f) => f.path).slice(0, 5).join(", ")}.`,
    [mapEv, ...outside.map(fileEvidence)],
  );
}
