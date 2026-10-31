import { excludePathspecs } from "./exclude.js";
import { join } from "node:path";
import type { ClockPort, FsPort, GitPort } from "../ports.js";

export interface ResolveOptions {
  git: GitPort;
  fs: FsPort;
  clock: ClockPort;
  repoPath: string;
  runId: string;
  base?: string | undefined;
  head?: string | undefined;
}

export interface ResolvedRefs {
  repoRoot: string;
  baseSha: string;
  headSha: string;
  headIsSnapshot: boolean;
  branch: string;
}

async function revParse(git: GitPort, repoPath: string, ref: string): Promise<string | null> {
  const result = await git.raw(["rev-parse", "--verify", "--quiet", `${ref}^{commit}`], {
    cwd: repoPath,
  });
  if (result.exitCode !== 0) return null;
  const sha = result.stdout.trim();
  return sha.length > 0 ? sha : null;
}

async function mergeBase(
  git: GitPort,
  repoPath: string,
  a: string,
  b: string,
): Promise<string | null> {
  const result = await git.raw(["merge-base", a, b], { cwd: repoPath });
  if (result.exitCode !== 0) return null;
  const sha = result.stdout.trim();
  return sha.length > 0 ? sha : null;
}

async function defaultBase(git: GitPort, repoPath: string, from = "HEAD"): Promise<string | null> {
  const candidates: string[] = [];
  const remoteHead = await git.raw(["symbolic-ref", "-q", "refs/remotes/origin/HEAD"], {
    cwd: repoPath,
  });
  if (remoteHead.exitCode === 0) {
    const ref = remoteHead.stdout.trim().replace(/^refs\/remotes\//, "");
    if (ref) candidates.push(ref);
  }
  candidates.push("main", "master");
  for (const candidate of candidates) {
    const base = await mergeBase(git, repoPath, from, candidate);
    if (base) return base;
  }
  return revParse(git, repoPath, `${from}~1`);
}

/**
 * Creates a commit object for the current working tree without touching the
 * user's index, stash or branches (§9.3). Uses a throwaway index file.
 */
export async function createSnapshot(opts: {
  git: GitPort;
  fs: FsPort;
  clock: ClockPort;
  repoPath: string;
  runId: string;
}): Promise<string> {
  const indexFile = join(opts.fs.tmpdir(), `nocap-index-${opts.runId}-${opts.clock.now()}`);
  const env = { GIT_INDEX_FILE: indexFile };
  const git = (args: string[]) => opts.git.raw(args, { cwd: opts.repoPath, env });
  try {
    const readTree = await git(["read-tree", "HEAD"]);
    if (readTree.exitCode !== 0) throw new Error(`git read-tree failed: ${readTree.stderr}`);
    const add = await git(["add", "-A", "--", ...excludePathspecs()]);
    if (add.exitCode !== 0) throw new Error(`git add -A failed: ${add.stderr}`);
    const tree = await git(["write-tree"]);
    if (tree.exitCode !== 0) throw new Error(`git write-tree failed: ${tree.stderr}`);
    // The snapshot is a throwaway object; it must not depend on the user having a git identity (CI runners often do not).
    const commit = await git([
      "-c",
      "user.name=nocap",
      "-c",
      "user.email=nocap@localhost",
      "commit-tree",
      tree.stdout.trim(),
      "-p",
      "HEAD",
      "-m",
      "nocap snapshot",
    ]);
    if (commit.exitCode !== 0) throw new Error(`git commit-tree failed: ${commit.stderr}`);
    return commit.stdout.trim();
  } finally {
    await opts.fs.rm(indexFile, { force: true });
  }
}

export async function resolveRefs(opts: ResolveOptions): Promise<ResolvedRefs> {
  const { git, repoPath } = opts;
  const rootResult = await git.raw(["rev-parse", "--show-toplevel"], { cwd: repoPath });
  const repoRoot = rootResult.exitCode === 0 ? rootResult.stdout.trim() : repoPath;

  const headResult = await git.raw(["rev-parse", "HEAD"], { cwd: repoRoot });
  if (headResult.exitCode !== 0) {
    throw new Error("this directory is not a git repository with at least one commit");
  }
  const headSha = headResult.stdout.trim();
  const branchResult = await git.raw(["rev-parse", "--abbrev-ref", "HEAD"], { cwd: repoRoot });
  const branch = branchResult.exitCode === 0 ? branchResult.stdout.trim() : "HEAD";

  const explicitBase = opts.base ? await revParse(git, repoRoot, opts.base) : null;
  if (opts.base && !explicitBase) {
    throw new Error(`base ref not found: ${opts.base}`);
  }

  if (opts.head) {
    const explicitHead = await revParse(git, repoRoot, opts.head);
    if (!explicitHead) throw new Error(`head ref not found: ${opts.head}`);
    let baseSha =
      explicitBase ??
      (await defaultBase(git, repoRoot, explicitHead)) ??
      (await revParse(git, repoRoot, `${explicitHead}~1`)) ??
      headSha;
    if (baseSha === explicitHead) {
      baseSha = (await revParse(git, repoRoot, `${explicitHead}~1`)) ?? explicitHead;
    }
    return { repoRoot, baseSha, headSha: explicitHead, headIsSnapshot: false, branch };
  }

  // GIT_OPTIONAL_LOCKS=0 keeps git from refreshing (and rewriting) the index.
  const status = await git.raw(["status", "--porcelain"], {
    cwd: repoRoot,
    env: { GIT_OPTIONAL_LOCKS: "0" },
  });
  if (status.exitCode !== 0) throw new Error(`git status failed: ${status.stderr}`);

  if (status.stdout.trim().length > 0) {
    const snapshot = await createSnapshot({
      git,
      fs: opts.fs,
      clock: opts.clock,
      repoPath: repoRoot,
      runId: opts.runId,
    });
    return {
      repoRoot,
      baseSha: explicitBase ?? headSha,
      headSha: snapshot,
      headIsSnapshot: true,
      branch,
    };
  }

  // The default branch can be the current branch (a fresh repo), which would
  // produce an empty diff. Fall back to the parent commit instead.
  let baseSha =
    explicitBase ??
    (await defaultBase(git, repoRoot)) ??
    (await revParse(git, repoRoot, `${headSha}~1`)) ??
    headSha;
  if (baseSha === headSha) {
    baseSha = (await revParse(git, repoRoot, `${headSha}~1`)) ?? headSha;
  }
  return { repoRoot, baseSha, headSha, headIsSnapshot: false, branch };
}
