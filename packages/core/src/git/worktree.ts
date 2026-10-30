import { join } from "node:path";
import type { ExecPort, FsPort, GitPort } from "../ports.js";
import { findNestedNodeModules } from "./workspace.js";

export interface WorktreeOptions {
  git: GitPort;
  fs: FsPort;
  repoRoot: string;
  ref: string;
  runId: string;
  /** Needed to clone or copy dependency directories. Without it they are linked entry by entry (read-only use). */
  exec?: ExecPort;
  /**
   * `auto`: clone dependency directories when the filesystem can do it cheaply (APFS `cp -c`, reflink), else link them.
   * `writable`: the run may write (a build). Dependency directories must be real: clone, else copy under a size cap.
   * `link`: always link (tests).
   */
  modules?: "auto" | "writable" | "link";
  /** Largest dependency tree, in KiB, that `writable` mode will copy when it cannot clone. */
  maxCopyKiB?: number;
}

export type ModulesState = "clone" | "copy" | "link";

export interface Worktree {
  path: string;
  /** How dependency directories were provided. `clone` and `copy` are independent of the user's; `link` points at them. */
  modules: ModulesState;
  /** True when nothing a run writes can reach the user's dependency directories. */
  isolated: boolean;
  remove(): Promise<void>;
}

const DEFAULT_MAX_COPY_KIB = 1_500_000;
/** Dependency-manager state and caches. They are never linked: a run that writes them must write its own copy. */
const STATE_ENTRIES = new Set([".modules.yaml", ".package-map.json", ".pnpm-workspace-state-v1.json", ".vite", ".vite-temp", ".vitest-cache", ".cache", ".yarn-integrity", ".package-lock.json"]);

async function platform(exec: ExecPort): Promise<string> {
  const r = await exec.run("uname", ["-s"], { cwd: "/" }).catch(() => null);
  return (r?.stdout ?? "").trim().toLowerCase();
}

/** Copy-on-write clone of a directory tree: `cp -c -R` on macOS (APFS), `cp -R --reflink=always` elsewhere (btrfs, xfs). */
async function clone(exec: ExecPort, os: string, from: string, to: string): Promise<boolean> {
  const args = os === "darwin" ? ["-c", "-R", from, to] : ["-R", "--reflink=always", from, to];
  const r = await exec.run("cp", args, { cwd: "/", timeoutMs: 120_000 }).catch(() => null);
  return r !== null && r.exitCode === 0;
}

async function sizeKiB(exec: ExecPort, dirs: string[]): Promise<number> {
  let total = 0;
  for (const d of dirs) {
    const r = await exec.run("du", ["-sk", d], { cwd: "/" }).catch(() => null);
    total += Number.parseInt((r?.stdout ?? "0").split(/\s+/)[0] ?? "0", 10) || 0;
  }
  return total;
}

/**
 * A throwaway checkout at `ref`. It never touches the user's working tree and
 * is always removed with `git worktree remove --force` + `git worktree prune`.
 * Dependency directories are cloned when possible so nothing a run writes can reach the user's; otherwise they are
 * linked entry by entry (caches and manager state excluded) and a writable run is refused.
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

  // Every dependency directory present in the user's repo: root and workspace packages, plus a Python venv.
  const nested = await findNestedNodeModules(opts.fs, opts.repoRoot);
  const modulesDirs: string[] = [];
  const venvs: string[] = [];
  if (await opts.fs.exists(join(opts.repoRoot, "node_modules"))) modulesDirs.push("node_modules");
  for (const rel of nested) if (await opts.fs.exists(join(path, rel))) modulesDirs.push(`${rel}/node_modules`);
  if (await opts.fs.exists(join(opts.repoRoot, ".venv"))) venvs.push(".venv");
  const all = [...modulesDirs, ...venvs];

  let state: ModulesState = "link";
  const mode = opts.modules ?? "auto";
  if (opts.exec && mode !== "link" && all.length > 0) {
    const os = await platform(opts.exec);
    const done: string[] = [];
    let ok = true;
    for (const rel of all) {
      if (await clone(opts.exec, os, join(opts.repoRoot, rel), join(path, rel))) done.push(rel);
      else {
        ok = false;
        await opts.fs.rm(join(path, rel), { recursive: true, force: true });
        break;
      }
    }
    if (ok) {
      state = "clone";
      await retargetWorkspaceLinks(opts.fs, opts.repoRoot, path, modulesDirs);
    }
    else {
      for (const rel of done) await opts.fs.rm(join(path, rel), { recursive: true, force: true });
      if (mode === "writable") {
        const kib = await sizeKiB(opts.exec, all.map((rel) => join(opts.repoRoot, rel)));
        if (kib > 0 && kib <= (opts.maxCopyKiB ?? DEFAULT_MAX_COPY_KIB)) {
          let copied = true;
          for (const rel of all) {
            const r = await opts.exec.run("cp", ["-R", join(opts.repoRoot, rel), join(path, rel)], { cwd: "/", timeoutMs: 300_000 }).catch(() => null);
            if (!r || r.exitCode !== 0) {
              copied = false;
              break;
            }
          }
          if (copied) {
            state = "copy";
            await retargetWorkspaceLinks(opts.fs, opts.repoRoot, path, modulesDirs);
          }
          else for (const rel of all) await opts.fs.rm(join(path, rel), { recursive: true, force: true });
        }
      }
    }
  }

  if (state === "link") {
    // Read-only use. Entries are linked one by one into a real directory, so anything new a run writes (caches, state)
    // lands in the worktree. Workspace siblings are retargeted to the worktree's own copy.
    const repoReal = await opts.fs.realpath(opts.repoRoot).catch(() => opts.repoRoot);
    for (const rel of modulesDirs) {
      await linkNodeModules(opts.fs, join(opts.repoRoot, rel), join(path, rel), repoReal, path);
    }
    for (const rel of venvs) {
      try {
        await opts.fs.symlink(join(opts.repoRoot, rel), join(path, rel));
      } catch {
        // already present
      }
    }
  }

  let removed = false;
  return {
    path,
    modules: state,
    isolated: state !== "link" || all.length === 0,
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
    if (STATE_ENTRIES.has(name)) continue;
    if (name.startsWith("@")) {
      const scopeDir = join(to, name);
      await fs.mkdir(scopeDir).catch(() => undefined);
      for (const sub of await fs.readdir(join(from, name)).catch(() => [] as string[])) await link(sub, join(from, name), scopeDir);
    } else {
      await link(name, from, to);
    }
  }
}

/**
 * A cloned or copied node_modules keeps absolute symlinks as they are. One that points at a workspace package inside the
 * user's repo would make the worktree's package import the user's copy (stale, and writable). Re-point it at the worktree's own copy.
 */
async function retargetWorkspaceLinks(fs: FsPort, repoRoot: string, worktree: string, modulesDirs: string[]): Promise<void> {
  const repoReal = await fs.realpath(repoRoot).catch(() => repoRoot);
  const fix = async (dir: string, name: string): Promise<void> => {
    const entry = join(dir, name);
    const real = await fs.realpath(entry).catch(() => null);
    const here = `${await fs.realpath(dir).catch(() => dir)}/${name}`;
    if (!real || real === here || !real.startsWith(`${repoReal}/`)) return; // a real entry, or a link that already stays inside the worktree
    const inside = real.slice(repoReal.length + 1);
    if (inside.split("/").includes("node_modules")) return; // an external dependency, not a workspace sibling
    await fs.rm(entry, { force: true });
    await fs.symlink(join(worktree, inside), entry);
  };
  for (const rel of modulesDirs) {
    const dir = join(worktree, rel);
    for (const name of await fs.readdir(dir).catch(() => [] as string[])) {
      if (name.startsWith("@")) for (const sub of await fs.readdir(join(dir, name)).catch(() => [] as string[])) await fix(join(dir, name), sub);
      else if (!name.startsWith(".")) await fix(dir, name);
    }
  }
}
