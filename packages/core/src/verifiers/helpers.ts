import type { Claim } from "../schema/claim.js";
import type { Evidence } from "../schema/evidence.js";
import type { BitecheckResult, Flag, Verdict } from "../schema/verdict.js";
import type { ChangeSet, ChangedFile, DiffHunk } from "../git/types.js";
import type { Mapping } from "../extract/keywordScope.js";
import type { TestRunResult } from "../runners/types.js";

export interface VerifyContext {
  changeSet: ChangeSet;
  filesAtHead: string[];
  mappings: Map<string, Mapping>;
  suite: TestRunResult | null;
  bitechecks: Map<string, BitecheckResult>;
  commands: Map<string, { exitCode: number; durationMs: number; stderrTail: string; command: string }>;
  flags: Flag[];
  execEnabled: boolean;
  readFileAtHead(path: string): Promise<string | null>;
}

export function verified(
  reason: string,
  evidence: Evidence[] = [],
  extra: Partial<Pick<Verdict, "flags" | "bitecheck">> = {},
): Verdict {
  return { status: "verified", reason, evidence, flags: extra.flags ?? [], bitecheck: extra.bitecheck ?? null, repair: null };
}

export function contradicted(
  reason: string,
  evidence: Evidence[] = [],
  extra: Partial<Pick<Verdict, "flags" | "bitecheck">> = {},
): Verdict {
  return {
    status: "contradicted",
    reason,
    evidence,
    flags: extra.flags ?? [],
    bitecheck: extra.bitecheck ?? null,
    repair: null,
  };
}

export function unverifiable(reason: string, evidence: Evidence[] = []): Verdict {
  return { status: "unverifiable", reason, evidence, flags: [], bitecheck: null, repair: null };
}

export function fileEvidence(file: ChangedFile): Evidence {
  return {
    kind: "file",
    path: file.path,
    status: file.status,
    additions: file.additions,
    deletions: file.deletions,
    previousPath: file.previousPath,
  };
}

export function hunkEvidence(hunk: DiffHunk, limit = 30): Evidence {
  const lines = hunk.lines.slice(0, limit).map((line) => {
    const prefix = line.type === "add" ? "+" : line.type === "del" ? "-" : " ";
    return `${prefix}${line.content}`;
  });
  return { kind: "hunk", path: hunk.path, startLine: hunk.newStart || hunk.oldStart, lines };
}

export function mappingEvidence(mapping: Mapping, source: "llm" | "keyword" | "user"): Evidence {
  return {
    kind: "mapping",
    concept: mapping.concept,
    globs: mapping.globs,
    matchedFiles: mapping.matchedFiles.length,
    source,
  };
}

export function claimConcept(claim: Claim): string {
  return (claim.subject ?? claim.paths[0] ?? "").toLowerCase();
}
