import type { Claim } from "../schema/claim.js";
import type { Verdict } from "../schema/verdict.js";
import type { ChangedFile } from "../git/types.js";
import { isConfigPath, isTestPath } from "../git/classify.js";
import { verifyCount } from "./count.js";
import { verifyBugFixed, verifyBuild, verifyRefactor, verifyTestsAdded, verifyTestsPass } from "./dataDriven.js";
import { verifyDependency } from "./dependency.js";
import { verifyFileSet } from "./fileSet.js";
import { fileEvidence, unverifiable, type VerifyContext } from "./helpers.js";
import { verifyScope } from "./scope.js";
import { verifySymbol } from "./symbol.js";

export * from "./helpers.js";

export async function verifyClaim(claim: Claim, ctx: VerifyContext): Promise<Verdict> {
  switch (claim.type) {
    case "file_created":
    case "file_modified":
    case "file_deleted":
    case "file_renamed":
      return verifyFileSet(claim, ctx);
    case "scope_none":
    case "scope_only":
      return verifyScope(claim, ctx);
    case "tests_added":
      return verifyTestsAdded(claim, ctx);
    case "tests_pass":
      return verifyTestsPass(claim, ctx);
    case "build_pass":
      return verifyBuild(claim, ctx);
    case "symbol_added":
      return verifySymbol(claim, ctx);
    case "dependency_added":
    case "dependency_removed":
      return verifyDependency(claim, ctx);
    case "bug_fixed":
      return verifyBugFixed(claim, ctx);
    case "refactor_no_behavior_change":
      return verifyRefactor(claim, ctx);
    case "count_files_changed":
      return verifyCount(claim, ctx);
    default:
      return unverifiable("Not a checkable claim.");
  }
}

/** Changed files that no claim's evidence mentions; test and config files first. */
export function undisclosedChanges(files: ChangedFile[], verdicts: Verdict[]) {
  const seen = new Set<string>();
  for (const v of verdicts) for (const e of v.evidence) if ("path" in e) seen.add(e.path);
  const rank = (f: ChangedFile) => (isTestPath(f.path) ? 0 : isConfigPath(f.path) ? 1 : 2);
  return files
    .filter((f) => !seen.has(f.path))
    .sort((a, b) => rank(a) - rank(b) || a.path.localeCompare(b.path))
    .map(fileEvidence);
}
