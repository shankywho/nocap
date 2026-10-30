import type { Claim } from "../schema/claim.js";
import type { Verdict } from "../schema/verdict.js";
import type { ChangedFile } from "../git/types.js";
import { contradicted, fileEvidence, unverifiable, verified, type VerifyContext } from "./helpers.js";

type Resolved =
  | { kind: "found"; path: string }
  | { kind: "ambiguous"; candidates: string[] }
  | { kind: "none" };

const base = (path: string) => path.split("/").pop() ?? path;

/** Exact match first, then a unique basename match among changed files and the head tree. */
export function resolvePath(raw: string, ctx: VerifyContext): Resolved {
  const wanted = raw.replace(/^\.\//, "");
  const universe = new Set<string>([...ctx.changeSet.files.map((f) => f.path), ...ctx.filesAtHead]);
  for (const f of ctx.changeSet.files) if (f.previousPath) universe.add(f.previousPath);
  if (universe.has(wanted)) return { kind: "found", path: wanted };
  const candidates = [...universe].filter((p) => base(p) === base(wanted)).sort();
  if (candidates.length === 1 && candidates[0] !== undefined) return { kind: "found", path: candidates[0] };
  if (candidates.length > 1) return { kind: "ambiguous", candidates };
  return { kind: "none" };
}

function findChange(ctx: VerifyContext, path: string): ChangedFile | undefined {
  return ctx.changeSet.files.find((f) => f.path === path || f.previousPath === path);
}

export function verifyFileSet(claim: Claim, ctx: VerifyContext): Verdict {
  const raw = claim.paths[0];
  if (!raw) return unverifiable("The claim names no file path, so it cannot be checked.");

  if (claim.type === "file_renamed") return verifyRename(claim, ctx);

  const resolved = resolvePath(raw, ctx);
  if (resolved.kind === "ambiguous") {
    return unverifiable(`'${raw}' matches several files: ${resolved.candidates.slice(0, 4).join(", ")}.`);
  }
  const head = new Set(ctx.filesAtHead);

  if (resolved.kind === "none") {
    if (claim.type === "file_created") return contradicted(`'${raw}' is not in the change set or the head tree.`);
    if (claim.type === "file_modified") return contradicted(`'${raw}' does not exist and was not changed.`);
    return unverifiable(`'${raw}' is not in the change set or the head tree.`);
  }

  const path = resolved.path;
  const change = findChange(ctx, path);
  const exists = head.has(path);

  switch (claim.type) {
    case "file_created":
      if (change?.status === "A") return verified(`${path} was added.`, [fileEvidence(change)]);
      if (change) return contradicted(`${path} already existed; its status is ${change.status}, not added.`, [fileEvidence(change)]);
      return exists
        ? unverifiable(`${path} exists but is not part of this change, so creation cannot be confirmed.`)
        : contradicted(`${path} is not in the change set or the head tree.`);
    case "file_modified":
      if (change && (change.status === "M" || change.status === "R")) {
        return verified(`${path} was modified (+${change.additions} -${change.deletions}).`, [fileEvidence(change)]);
      }
      if (change?.status === "A") return verified(`${path} is new in this change (+${change.additions}).`, [fileEvidence(change)]);
      if (change?.status === "D") return contradicted(`${path} was deleted, not modified.`, [fileEvidence(change)]);
      return exists ? contradicted(`${path} exists but is unchanged in this diff.`) : unverifiable(`${path} not found.`);
    case "file_deleted":
      if (change?.status === "D") return verified(`${path} was deleted.`, [fileEvidence(change)]);
      return exists
        ? contradicted(`${path} still exists at head.`, change ? [fileEvidence(change)] : [])
        : unverifiable(`${path} is absent but was not deleted in this change.`);
    default:
      return unverifiable("Not a file-set claim.");
  }
}

function verifyRename(claim: Claim, ctx: VerifyContext): Verdict {
  const [from, to] = claim.paths;
  const renames = ctx.changeSet.files.filter((f) => f.status === "R");
  if (from && to) {
    const hit = renames.find((f) => f.previousPath !== null && base(f.previousPath) === base(from) && base(f.path) === base(to));
    if (hit) return verified(`${hit.previousPath} was renamed to ${hit.path}.`, [fileEvidence(hit)]);
  }
  const any = renames.find((f) => [from, to].some((p) => p && (base(f.path) === base(p) || (f.previousPath && base(f.previousPath) === base(p)))));
  if (any) return verified(`${any.previousPath} was renamed to ${any.path}.`, [fileEvidence(any)]);
  const touched = ctx.changeSet.files.find((f) => [from, to].some((p) => p && (f.path === p || f.previousPath === p)));
  if (!touched) return contradicted("Neither the old nor the new path appears in the diff.");
  return contradicted(`${touched.path} changed with status ${touched.status}, not as a rename.`, [fileEvidence(touched)]);
}
