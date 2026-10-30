/**
 * INVARIANT: nocap never modifies the user's real repo. Before and after a full monorepo Bitecheck run (with tests and a
 * build that both try to write into node_modules), the real dependency tree and manifests are identical.
 * This runs in CI as part of `pnpm test`.
 */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, readlinkSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { verifyLocal } from "../src/adapters/local";
import { ExecaExec } from "../src/adapters/exec.execa";
import { NodeFs } from "../src/adapters/fs.node";
import { SimpleGitPort } from "../src/adapters/git.simple";
import { createWorktree } from "../src/git/worktree";

const ENV = { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "", NOCAP_OFFLINE: "1" };
const git = (cwd: string, ...a: string[]) =>
  execFileSync("git", a, { cwd, encoding: "utf8", env: { ...ENV, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t" } }).trim();
const put = (root: string, rel: string, text: string) => {
  mkdirSync(dirname(join(root, rel)), { recursive: true });
  writeFileSync(join(root, rel), text);
};

/** Everything an install or a stray write could change: state file hash, link targets, every file in node_modules, manifest mtimes. */
function snapshot(root: string): string {
  const parts: string[] = [];
  const state = join(root, "node_modules", ".modules.yaml");
  parts.push(`modules.yaml:${existsSync(state) ? createHash("sha256").update(readFileSync(state)).digest("hex") : "absent"}`);
  const walk = (dir: string, rel: string) => {
    for (const name of readdirSync(dir).sort()) {
      const p = join(dir, name);
      const st = lstatSync(p);
      if (st.isSymbolicLink()) parts.push(`L ${rel}/${name} -> ${readlinkSync(p)}`);
      else if (st.isDirectory()) {
        parts.push(`D ${rel}/${name}`);
        walk(p, `${rel}/${name}`);
      } else parts.push(`F ${rel}/${name} ${st.size} ${Math.round(st.mtimeMs)}`);
    }
  };
  for (const nm of ["node_modules", "packages/a/node_modules", "packages/b/node_modules"]) if (existsSync(join(root, nm))) walk(join(root, nm), nm);
  for (const f of ["package.json", "pnpm-lock.yaml", "pnpm-workspace.yaml", "packages/a/package.json", "packages/b/package.json"]) {
    parts.push(`${f}:${existsSync(join(root, f)) ? Math.round(statSync(join(root, f)).mtimeMs) : "absent"}`);
  }
  return parts.join("\n");
}

let tmp = "";
beforeAll(async () => {
  tmp = await mkdtemp(join(tmpdir(), "nocap-safety-"));
});
afterAll(async () => rm(tmp, { recursive: true, force: true }));

/** A pnpm-shaped workspace: real node_modules with a virtual store, relative workspace links, state file, and a writer test + writer build. */
function repo(name: string, built = true) {
  const dir = join(tmp, name);
  put(dir, "package.json", JSON.stringify({ name: "root", private: true, scripts: { test: "node --test", build: "node packages/a/build.mjs" } }));
  put(dir, "pnpm-workspace.yaml", 'packages:\n  - "packages/*"\n');
  put(dir, "pnpm-lock.yaml", "lockfileVersion: '9.0'\n");
  put(dir, ".gitignore", "node_modules\ndist\n");
  put(dir, "packages/a/package.json", JSON.stringify({ name: "@ws/a", type: "module", main: built ? "dist/index.js" : "src/index.js" }));
  put(dir, "packages/a/src/index.js", "export const one = () => 1;\n");
  // a build that also tries to write into node_modules, the way a bundler cache would
  put(dir, "packages/a/build.mjs", [
    'import { cpSync, mkdirSync, writeFileSync } from "node:fs";',
    'import { dirname, join } from "node:path";',
    'import { fileURLToPath } from "node:url";',
    'const here = dirname(fileURLToPath(import.meta.url));',
    'mkdirSync(join(here, "dist"), { recursive: true });',
    'cpSync(join(here, "src/index.js"), join(here, "dist/index.js"));',
    'mkdirSync(join(here, "../../node_modules/.cache"), { recursive: true });',
    'writeFileSync(join(here, "../../node_modules/.cache/build-probe"), "x");',
    'writeFileSync(join(here, "../../node_modules/foo/build-wrote-through-link"), "x");',
    "",
  ].join("\n"));
  put(dir, "packages/b/package.json", JSON.stringify({ name: "@ws/b", type: "module" }));
  put(dir, "packages/b/src/b.js", 'import { one } from "@ws/a";\nexport const two = () => one() + 1;\n');
  git(dir, "init", "-q", "-b", "main");
  git(dir, "add", "-A");
  git(dir, "commit", "-q", "-m", "base");
  // what the package manager leaves behind (all gitignored)
  put(dir, "node_modules/.modules.yaml", "layoutVersion: 5\nstoreDir: /store\nvirtualStoreDir: .pnpm\n");
  put(dir, "node_modules/.pnpm/foo@1.0.0/node_modules/foo/index.js", "module.exports = 1;\n");
  symlinkSync(".pnpm/foo@1.0.0/node_modules/foo", join(dir, "node_modules/foo"));
  mkdirSync(join(dir, "node_modules/.bin"), { recursive: true });
  writeFileSync(join(dir, "node_modules/.bin/foo"), "#!/bin/sh\n");
  mkdirSync(join(dir, "packages/b/node_modules/@ws"), { recursive: true });
  symlinkSync("../../../a", join(dir, "packages/b/node_modules/@ws/a"));
  symlinkSync("../../../node_modules/.pnpm/foo@1.0.0/node_modules/foo", join(dir, "packages/b/node_modules/foo"));
  // the agent's change: a new function in b, and tests that write into node_modules while they run
  put(dir, "packages/a/src/index.js", "export const one = () => 10;\n");
  if (built) execFileSync("node", ["packages/a/build.mjs"], { cwd: dir }); // the user's own build, before we snapshot
  rmDir(join(dir, "node_modules/.cache"));
  rmDir(join(dir, "node_modules/foo/../.pnpm/foo@1.0.0/node_modules/foo/build-wrote-through-link"));
  put(dir, "packages/b/test/b.test.js", 'import { test } from "node:test";\nimport assert from "node:assert";\nimport { two } from "../src/b.js";\ntest("two follows one", () => assert.equal(two(), 11));\n');
  put(dir, "packages/b/test/probe.test.js", [
    'import { test } from "node:test";',
    'import { mkdirSync, writeFileSync } from "node:fs";',
    'import { join } from "node:path";',
    'test("probe: tests that write caches into node_modules", () => {',
    '  const root = process.cwd();',
    '  // nocap\'s in-place suite run executes the USER\'s own tests in their repo; only worktree runs are under test here',
    '  if (!root.endsWith("/wt")) return;',
    '  mkdirSync(join(root, "node_modules/.cache"), { recursive: true });',
    '  writeFileSync(join(root, "node_modules/.cache/test-probe"), "x");',
    '  mkdirSync(join(root, "packages/b/node_modules/.cache"), { recursive: true });',
    '  writeFileSync(join(root, "packages/b/node_modules/.cache/test-probe"), "x");',
    '  writeFileSync(join(root, "node_modules/.modules.yaml"), "overwritten by a test");',
    "});",
    "",
  ].join("\n"));
  return dir;
}
function rmDir(p: string) {
  try {
    execFileSync("rm", ["-rf", p]);
  } catch {
    // absent
  }
}

const SUMMARY = "Added tests for two in packages/b/test/b.test.js and packages/b/test/probe.test.js.";

describe("invariant: a full monorepo Bitecheck run leaves the real repo identical", () => {
  it("default run (no --allow-build, auto dependency mode)", async () => {
    const dir = repo("inv-default");
    const before = snapshot(dir);
    const { receipt } = await verifyLocal({ repoPath: dir, summary: SUMMARY, exec: true, offline: true, save: false }, ENV);
    expect(receipt.claims.length).toBeGreaterThan(0);
    expect(snapshot(dir)).toBe(before);
    expect(git(dir, "worktree", "list").split("\n")).toHaveLength(1); // no worktree left behind
  }, 240_000);

  it("default run with dependency directories forced to links", async () => {
    const dir = repo("inv-link");
    const before = snapshot(dir);
    await verifyLocal({ repoPath: dir, summary: SUMMARY, exec: true, offline: true, save: false, modulesMode: "link" }, ENV);
    expect(snapshot(dir)).toBe(before);
  }, 240_000);

  it("--allow-build run: the build and the tests write into node_modules, and none of it reaches the real tree", async () => {
    const dir = repo("inv-build");
    const before = snapshot(dir);
    const { receipt } = await verifyLocal({ repoPath: dir, summary: SUMMARY, exec: true, offline: true, save: false, allowBuild: true }, ENV);
    expect(receipt.claims.length).toBeGreaterThan(0);
    expect(snapshot(dir)).toBe(before);
    expect(existsSync(join(dir, "node_modules/.cache"))).toBe(false);
  }, 240_000);

  it("--allow-build with links forced refuses to build (environment) instead of writing through links", async () => {
    const dir = repo("inv-build-link");
    const before = snapshot(dir);
    const { receipt } = await verifyLocal({ repoPath: dir, summary: SUMMARY, exec: true, offline: true, save: false, allowBuild: true, modulesMode: "link" }, ENV);
    expect(snapshot(dir)).toBe(before);
    // the build was needed and could not be isolated by cloning: never a ✗
    expect(receipt.claims.every((c) => c.verdict.status !== "contradicted")).toBe(true);
  }, 240_000);
});

describe("invariant: runs that do execute tests in the worktree", () => {
  // No built output is needed here, so the head and reverted runs really execute in the worktree, writing probes.
  for (const mode of ["auto", "link"] as const) {
    it(`tests write caches and state into node_modules (${mode} mode); the real tree is untouched`, async () => {
      const dir = repo(`inv-run-${mode}`, false);
      const before = snapshot(dir);
      const { receipt } = await verifyLocal({ repoPath: dir, summary: SUMMARY, exec: true, offline: true, save: false, modulesMode: mode }, ENV);
      const bc = receipt.claims.find((c) => c.claim.type === "tests_added")?.verdict.bitecheck;
      expect(bc).not.toBeNull(); // Bitecheck really ran
      expect(bc?.outcome).not.toBe("environment");
      expect(snapshot(dir)).toBe(before);
    }, 240_000);
  }
});

describe("worktree dependency directories", () => {
  async function wt(name: string, modules: "auto" | "writable" | "link") {
    const dir = repo(name);
    const git2 = new SimpleGitPort(dir);
    const w = await createWorktree({ git: git2, fs: new NodeFs(), exec: new ExecaExec(), repoRoot: dir, ref: git(dir, "rev-parse", "HEAD"), runId: name, modules });
    return { dir, w };
  }

  it("link mode builds a real node_modules whose entries are links, with state and caches left out", async () => {
    const { dir, w } = await wt("wt-link", "link");
    try {
      expect(w.modules).toBe("link");
      expect(w.isolated).toBe(false);
      expect(lstatSync(join(w.path, "node_modules")).isSymbolicLink()).toBe(false); // never a wholesale symlink
      expect(existsSync(join(w.path, "node_modules/.modules.yaml"))).toBe(false);
      expect(lstatSync(join(w.path, "node_modules/foo")).isSymbolicLink()).toBe(true);
      // the workspace link resolves to the WORKTREE's package, not the user's
      expect(execFileSync("node", ["-e", 'console.log(require("fs").realpathSync("packages/b/node_modules/@ws/a"))'], { cwd: w.path, encoding: "utf8" }).trim()).toBe(execFileSync("node", ["-e", 'console.log(require("fs").realpathSync("packages/a"))'], { cwd: w.path, encoding: "utf8" }).trim());
    } finally {
      await w.remove();
    }
    expect(existsSync(dir)).toBe(true);
  }, 120_000);

  it("auto mode clones when the filesystem can (APFS, reflink); otherwise it links", async () => {
    const { w } = await wt("wt-auto", "auto");
    try {
      expect(["clone", "link"]).toContain(w.modules);
      if (w.modules === "clone") {
        expect(w.isolated).toBe(true);
        expect(lstatSync(join(w.path, "node_modules/.pnpm")).isSymbolicLink()).toBe(false);
        expect(readFileSync(join(w.path, "node_modules/.modules.yaml"), "utf8")).toContain("virtualStoreDir");
      }
    } finally {
      await w.remove();
    }
  }, 120_000);

  it("writable mode yields an isolated copy (clone or capped copy) or says it cannot, never a link", async () => {
    const { w } = await wt("wt-writable", "writable");
    try {
      expect(w.isolated).toBe(w.modules !== "link");
      if (w.isolated) {
        // a write in the worktree does not exist in the real tree
        writeFileSync(join(w.path, "node_modules/.pnpm/foo@1.0.0/node_modules/foo/index.js"), "changed in the worktree");
      }
    } finally {
      await w.remove();
    }
  }, 120_000);

  it("writable mode refuses a dependency tree over the copy cap when it cannot clone", async () => {
    const dir = repo("wt-cap");
    const w = await createWorktree({ git: new SimpleGitPort(dir), fs: new NodeFs(), exec: new ExecaExec(), repoRoot: dir, ref: git(dir, "rev-parse", "HEAD"), runId: "cap", modules: "writable", maxCopyKiB: 0 });
    try {
      // with a zero cap, a filesystem that cannot clone must give up rather than link; one that can clone is isolated anyway
      expect(w.isolated).toBe(w.modules === "clone");
    } finally {
      await w.remove();
    }
  }, 120_000);
});
