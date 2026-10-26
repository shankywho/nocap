import { join } from "node:path";
import type { FsPort, GitPort } from "../ports.js";

export interface WorktreeOptions {
  git: GitPort;
  fs: FsPort;
  repoRoot: string;
  ref: string;
  runId: string;
}

export interface Worktree {
  path: string;
  remove(): Promise<void>;
}

/**
 * A throwaway checkout at `ref`. It never touches the user's working tree and
 * is always removed with `git worktree remove --force` + `git worktree prune`.
 */
export async function createWorktree(opts: WorktreeOptions): Promise<Worktree> {
  const base = await opts.fs.mkdtemp(`nocap-${opts.runId}-`);
  const path = join(base, "wt");
  const add = await opts.git.raw(["worktree", "add", "--detach", "--force", path, opts.ref], {
    cwd: opts.repoRoot,
  });
  if (add.exitCode !== 0) {
    await opts.fs.rm(base, { recursive: true, force: true });
    throw new Error(`git worktree add failed: ${add.stderr}`);
  }

  for (const dir of ["node_modules", ".venv"]) {
    const source = join(opts.repoRoot, dir);
    if (await opts.fs.exists(source)) {
      try {
        await opts.fs.symlink(source, join(path, dir));
      } catch {
        // a worktree that already has the directory is fine
      }
    }
  }

  let removed = false;
  return {
    path,
    async remove(): Promise<void> {
      if (removed) return;
      removed = true;
      await opts.git.raw(["worktree", "remove", "--force", path], { cwd: opts.repoRoot });
      await opts.git.raw(["worktree", "prune"], { cwd: opts.repoRoot });
      await opts.fs.rm(base, { recursive: true, force: true });
    },
  };
}

export async function withWorktree<T>(
  opts: WorktreeOptions,
  fn: (worktree: Worktree) => Promise<T>,
): Promise<T> {
  const worktree = await createWorktree(opts);
  try {
    return await fn(worktree);
  } finally {
    await worktree.remove();
  }
}

export async function listWorktrees(git: GitPort, repoRoot: string): Promise<string[]> {
  const result = await git.raw(["worktree", "list", "--porcelain"], { cwd: repoRoot });
  if (result.exitCode !== 0) return [];
  return result.stdout
    .split("\n")
    .filter((line) => line.startsWith("worktree "))
    .map((line) => line.slice("worktree ".length));
}
