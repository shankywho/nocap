import { excludePathspecs, isAlwaysExcluded } from "./exclude.js";
import gitdiffParser, { type Change, type File as ParsedFile } from "gitdiff-parser";

/** gitdiff-parser ships CommonJS with an ESM-shaped .d.ts; narrow it once here. */
const parseUnifiedDiff = (gitdiffParser as unknown as { parse(source: string): ParsedFile[] })
  .parse;
import type { GitPort } from "../ports.js";
import type { ChangeSet, ChangedFile, ChangeStatus, DiffHunk, DiffLine } from "./types.js";

/** Parses `git diff --name-status -M -z` output. */
export function parseNameStatus(
  output: string,
): { path: string; status: ChangeStatus; previousPath: string | null }[] {
  const tokens = output.split("\0").filter((token) => token.length > 0);
  const result: { path: string; status: ChangeStatus; previousPath: string | null }[] = [];
  let index = 0;
  while (index < tokens.length) {
    const statusToken = tokens[index++];
    if (statusToken === undefined) break;
    const code = statusToken.charAt(0);
    if (code === "R" || code === "C") {
      const previousPath = tokens[index++];
      const path = tokens[index++];
      if (previousPath && path) {
        result.push({ path, status: code === "R" ? "R" : "U", previousPath });
      }
      continue;
    }
    const path = tokens[index++];
    if (!path) continue;
    const status: ChangeStatus =
      code === "A" ? "A" : code === "D" ? "D" : code === "M" || code === "T" ? "M" : "U";
    result.push({ path, status, previousPath: null });
  }
  return result;
}

/** Parses `git diff --numstat -M -z` output, including rename and binary records. */
export function parseNumstat(output: string): {
  path: string;
  additions: number;
  deletions: number;
  isBinary: boolean;
  previousPath: string | null;
}[] {
  const tokens = output.split("\0");
  const result: {
    path: string;
    additions: number;
    deletions: number;
    isBinary: boolean;
    previousPath: string | null;
  }[] = [];
  let index = 0;
  while (index < tokens.length) {
    const token = tokens[index++];
    if (token === undefined || token === "") {
      // A rename record is `add\tdel\t\0old\0new\0`; an empty token before
      // the pair is handled by the preceding record, so stop on stray empties.
      continue;
    }
    const parts = token.split("\t");
    const added = parts[0];
    const deleted = parts[1];
    if (added === undefined || deleted === undefined) continue;
    const isBinary = added === "-" || deleted === "-";
    const additions = isBinary ? 0 : Number.parseInt(added, 10) || 0;
    const deletions = isBinary ? 0 : Number.parseInt(deleted, 10) || 0;
    const inlinePath = parts[2];
    if (inlinePath === "" || inlinePath === undefined) {
      const previousPath = tokens[index++];
      const path = tokens[index++];
      if (previousPath && path) {
        result.push({ path, additions, deletions, isBinary, previousPath });
      }
      continue;
    }
    result.push({ path: inlinePath, additions, deletions, isBinary, previousPath: null });
  }
  return result;
}

function toDiffLine(change: Change): DiffLine {
  if (change.type === "insert") {
    return { type: "add", content: change.content, oldLine: null, newLine: change.lineNumber };
  }
  if (change.type === "delete") {
    return { type: "del", content: change.content, oldLine: change.lineNumber, newLine: null };
  }
  return {
    type: "normal",
    content: change.content,
    oldLine: change.oldLineNumber,
    newLine: change.newLineNumber,
  };
}

function pathOf(file: ParsedFile): string {
  return file.newPath && file.newPath !== "/dev/null" ? file.newPath : file.oldPath;
}

function toHunks(files: ParsedFile[]): DiffHunk[] {
  const hunks: DiffHunk[] = [];
  for (const file of files) {
    for (const hunk of file.hunks) {
      hunks.push({
        path: pathOf(file),
        oldStart: hunk.oldStart,
        newStart: hunk.newStart,
        lines: hunk.changes.map(toDiffLine),
      });
    }
  }
  return hunks.sort((a, b) => a.path.localeCompare(b.path) || a.newStart - b.newStart);
}

export interface DiffOptions {
  git: GitPort;
  repoPath: string;
  baseSha: string;
  headSha: string;
}

/** Reads name-status, numstat and -U0 hunks for one revision range. */
export async function readChangeSet(opts: DiffOptions): Promise<ChangeSet> {
  const { git, repoPath, baseSha, headSha } = opts;

  const nameStatusResult = await git.raw(
    ["diff", "--name-status", "-M", "-z", baseSha, headSha, "--", ...excludePathspecs()],
    { cwd: repoPath },
  );
  if (nameStatusResult.exitCode !== 0) {
    throw new Error(`git diff --name-status failed: ${nameStatusResult.stderr}`);
  }

  const numstatResult = await git.raw(["diff", "--numstat", "-M", "-z", baseSha, headSha, "--", ...excludePathspecs()], {
    cwd: repoPath,
  });
  if (numstatResult.exitCode !== 0) {
    throw new Error(`git diff --numstat failed: ${numstatResult.stderr}`);
  }

  const patchResult = await git.raw(
    ["diff", "-U0", "-M", "--no-color", "--no-ext-diff", baseSha, headSha, "--", ...excludePathspecs()],
    { cwd: repoPath },
  );
  if (patchResult.exitCode !== 0) {
    throw new Error(`git diff failed: ${patchResult.stderr}`);
  }

  const stats = new Map(parseNumstat(numstatResult.stdout).map((item) => [item.path, item]));
  const files: ChangedFile[] = parseNameStatus(nameStatusResult.stdout).map((item) => {
    const stat = stats.get(item.path);
    return {
      path: item.path,
      status: item.status,
      additions: stat?.additions ?? 0,
      deletions: stat?.deletions ?? 0,
      previousPath: item.previousPath ?? stat?.previousPath ?? null,
      isBinary: stat?.isBinary ?? false,
    };
  });

  files.sort((a, b) => a.path.localeCompare(b.path));
  const hunks = toHunks(parseUnifiedDiff(patchResult.stdout));
  // The pathspecs already exclude these; filtering again keeps the guarantee even if a git build ignores the magic.
  return { baseSha, headSha, files: files.filter((f) => !isAlwaysExcluded(f.path)), hunks: hunks.filter((h) => !isAlwaysExcluded(h.path)) };
}

export interface PatchedFile {
  filename: string;
  status: "added" | "removed" | "modified" | "renamed" | "copied" | "changed";
  additions: number;
  deletions: number;
  patch?: string | null;
  previousFilename?: string | null;
}

/** Builds a ChangeSet from GitHub PR files (PR mode has patches but no checkout). Patch-less files keep their stats, with no hunks. */
export function changeSetFromPatches(baseSha: string, headSha: string, input: PatchedFile[]): ChangeSet {
  const statusOf = (s: PatchedFile["status"]): ChangeStatus => (s === "added" ? "A" : s === "removed" ? "D" : s === "renamed" ? "R" : "M");
  const files: ChangedFile[] = input
    .filter((f) => !isAlwaysExcluded(f.filename))
    .map((f) => ({
      path: f.filename,
      status: statusOf(f.status),
      additions: f.additions,
      deletions: f.deletions,
      previousPath: f.previousFilename ?? null,
      isBinary: false,
    }))
    .sort((a, b) => a.path.localeCompare(b.path));
  const diff = input
    .filter((f) => f.patch && !isAlwaysExcluded(f.filename))
    .map((f) => `diff --git a/${f.previousFilename ?? f.filename} b/${f.filename}\n--- a/${f.previousFilename ?? f.filename}\n+++ b/${f.filename}\n${f.patch}\n`)
    .join("");
  return { baseSha, headSha, files, hunks: diff ? toHunks(parseUnifiedDiff(diff)) : [] };
}
