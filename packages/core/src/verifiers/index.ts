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

/**
 * Changed files that no claim covers; test and config files first. A claim covers a
 * file when it names the path, or its evidence or Bitecheck mentions it.
 */
export function undisclosedChanges(
  files: ChangedFile[],
  verdicts: Verdict[],
  claims: Claim[] = [],
) {
  const seen = new Set<string>();
  for (const claim of claims) for (const p of claim.paths) seen.add(p.replace(/^\.\//, ""));
  for (const v of verdicts) {
    for (const e of v.evidence) {
      if ("path" in e) seen.add(e.path);
      if (e.kind === "testRun") for (const t of e.tests) seen.add(t.file);
    }
    for (const t of v.bitecheck?.selectedTests ?? []) seen.add(t.file);
    for (const p of v.bitecheck?.revertedFiles ?? []) seen.add(p);
    for (const x of v.bitecheck?.stubbed ?? []) seen.add(x.split(" › ")[0] as string);
  }
  const covered = (path: string) => seen.has(path) || [...seen].some((s) => !s.includes("*") && s.includes("/") === false && path.endsWith(`/${s}`));
  const rank = (f: ChangedFile) => (isTestPath(f.path) ? 0 : isConfigPath(f.path) ? 1 : 2);
  return files
    .filter((f) => !covered(f.path))
    .sort((a, b) => rank(a) - rank(b) || a.path.localeCompare(b.path))
    .map(fileEvidence);
}
