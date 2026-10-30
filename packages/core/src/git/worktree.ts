import { join } from "node:path";
import type { FsPort, GitPort } from "../ports.js";
import { findNestedNodeModules } from "./workspace.js";

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

  // Monorepos: every workspace package has its own node_modules. Link it entry by entry, because a pnpm/npm workspace
  // link (`packages/b/node_modules/@ws/a -> ../../a`) must resolve to the worktree's copy of `a`, not the user's: otherwise a
  // revert in the worktree is invisible to the package that imports it.
  const repoReal = await opts.fs.realpath(opts.repoRoot).catch(() => opts.repoRoot);
  for (const rel of await findNestedNodeModules(opts.fs, opts.repoRoot)) {
    const target = join(path, rel);
    if (!(await opts.fs.exists(target))) continue; // the package is not part of this checkout
    await linkNodeModules(opts.fs, join(opts.repoRoot, rel, "node_modules"), join(target, "node_modules"), repoReal, path);
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

/** Entries of `from` that resolve to somewhere inside the repo (and not through node_modules) are workspace siblings. */
async function linkNodeModules(fs: FsPort, from: string, to: string, repoReal: string, worktree: string): Promise<void> {
  await fs.mkdir(to).catch(() => undefined);
  const link = async (name: string, sourceDir: string, destDir: string): Promise<void> => {
    const source = join(sourceDir, name);
    const real = await fs.realpath(source).catch(() => null);
    let target = source;
    if (real && real.startsWith(`${repoReal}/`)) {
      const inside = real.slice(repoReal.length + 1);
      if (!inside.split("/").includes("node_modules")) target = join(worktree, inside);
    }
    try {
      await fs.symlink(target, join(destDir, name));
    } catch {
      // already present
    }
  };
  for (const name of await fs.readdir(from).catch(() => [] as string[])) {
    if (name.startsWith("@")) {
      const scopeDir = join(to, name);
      await fs.mkdir(scopeDir).catch(() => undefined);
      for (const sub of await fs.readdir(join(from, name)).catch(() => [] as string[])) await link(sub, join(from, name), scopeDir);
    } else {
      await link(name, from, to);
    }
  }
}
