import { execFileSync } from "node:child_process";
import { mkdirSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { verifyLocal } from "../src/adapters/local";
import { ExecaExec } from "../src/adapters/exec.execa";
import { NodeFs } from "../src/adapters/fs.node";
import { collectedTooFew, failuresAreEnvironment, isEnvironmentMessage } from "../src/runners/classify";
import { runTests } from "../src/runners/run";
import { tally } from "../src/runners/tally";
import { parseJestJson } from "../src/runners/parseJest";
import { parseJunit } from "../src/runners/parseJunit";
import { detectBuildCommand, findNestedNodeModules, listWorkspacePackages, packagesMissingBuild } from "../src/git/workspace";

const ROOT = fileURLToPath(new URL("../../..", import.meta.url));
const ENV = { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "" };
const git = (cwd: string, ...a: string[]) =>
  execFileSync("git", a, { cwd, encoding: "utf8", env: { ...ENV, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t" } }).trim();
const put = (root: string, rel: string, text: string) => {
  mkdirSync(dirname(join(root, rel)), { recursive: true });
  writeFileSync(join(root, rel), text);
};

let tmp = "";
beforeAll(async () => {
  tmp = await mkdtemp(join(tmpdir(), "nocap-mono-"));
});
afterAll(async () => rm(tmp, { recursive: true, force: true }));

/** A real node_modules directory whose entries link to this repo's installed tools (vitest etc.), like a package manager's own layout. */
function linkRootModules(dir: string) {
  mkdirSync(join(dir, "node_modules"), { recursive: true });
  for (const name of readdirSync(join(ROOT, "node_modules"))) {
    if (name === ".modules.yaml" || name.startsWith(".vite")) continue;
    symlinkSync(join(ROOT, "node_modules", name), join(dir, "node_modules", name));
  }
}

/** An npm-workspace monorepo. `built`: package a is consumed through dist/, produced by the root build script. */
function workspace(name: string, built: boolean) {
  const dir = join(tmp, name);
  put(dir, "package.json", JSON.stringify({ name: "root", private: true, workspaces: ["packages/*"], scripts: { test: "vitest run", build: "node packages/a/build.mjs" } }));
  put(dir, ".gitignore", "node_modules\ndist\n");
  put(dir, "packages/a/package.json", JSON.stringify({ name: "@ws/a", type: "module", main: built ? "dist/index.js" : "src/index.js" }));
  put(dir, "packages/a/src/index.js", "export const one = () => 1;\n");
  put(dir, "packages/a/build.mjs", 'import { cpSync, mkdirSync } from "node:fs";\nimport { dirname, join } from "node:path";\nimport { fileURLToPath } from "node:url";\nconst here = dirname(fileURLToPath(import.meta.url));\nmkdirSync(join(here, "dist"), { recursive: true });\ncpSync(join(here, "src/index.js"), join(here, "dist/index.js"));\n');
  put(dir, "packages/b/package.json", JSON.stringify({ name: "@ws/b", type: "module" }));
  put(dir, "packages/b/src/b.js", 'import { one } from "@ws/a";\nexport const two = () => one() + 1;\n');
  git(dir, "init", "-q", "-b", "main");
  git(dir, "add", "-A");
  git(dir, "commit", "-q", "-m", "base");
  // what `pnpm install` / `npm install` leave behind, all gitignored
  linkRootModules(dir);
  mkdirSync(join(dir, "packages/b/node_modules/@ws"), { recursive: true });
  symlinkSync(join(dir, "packages/a"), join(dir, "packages/b/node_modules/@ws/a"), "junction");
  if (built) execFileSync("node", ["packages/a/build.mjs"], { cwd: dir });
  return dir;
}
const TEST_B = (n: number) => `import { expect, it } from "vitest";\nimport { two, three } from "../src/b.js";\nit("two adds one", () => expect(two()).toBe(2));\nit("three", () => expect(three()).toBe(${n}));\n`;
const claim = (r: Awaited<ReturnType<typeof verifyLocal>>["receipt"], type: string) => r.claims.find((c) => c.claim.type === type)?.verdict;

describe("monorepo: tests_pass runs in place, Bitecheck in a worktree that can resolve workspace packages", () => {
  it("a 2-package workspace whose tests pass in place gets tests_pass ✓ and Bitecheck bites", async () => {
    const dir = workspace("ws-source", false);
    put(dir, "packages/b/src/b.js", 'import { one } from "@ws/a";\nexport const two = () => one() + 1;\nexport const three = () => two() + 1;\n');
    put(dir, "packages/b/test/b.test.js", TEST_B(3));
    const { receipt } = await verifyLocal({ repoPath: dir, summary: "Added tests for three in packages/b/test/b.test.js. All 2 tests pass.", exec: true, offline: true, save: false }, { ...ENV, NOCAP_OFFLINE: "1" });
    expect(receipt.input.headIsSnapshot).toBe(true);
    expect(claim(receipt, "tests_pass")).toMatchObject({ status: "verified" });
    expect(claim(receipt, "tests_added")?.bitecheck).toMatchObject({ outcome: "bites", mode: "stub" });
    expect(claim(receipt, "tests_added")?.status).toBe("verified");
    expect(receipt.trace.find((t) => t.step === "suite")?.detail).toContain("in place");
  }, 180_000);

  it("the same tests in a bare checkout fail to resolve @ws/a: that is `environment`, never a failing test", async () => {
    const dir = workspace("ws-bare", false);
    put(dir, "packages/b/src/b.js", 'import { one } from "@ws/a";\nexport const two = () => one() + 1;\nexport const three = () => two() + 1;\n');
    put(dir, "packages/b/test/b.test.js", TEST_B(3));
    git(dir, "add", "-A");
    git(dir, "commit", "-q", "-m", "change");
    const bare = join(tmp, "ws-bare-wt");
    git(dir, "worktree", "add", "--detach", bare, "HEAD");
    symlinkSync(join(ROOT, "node_modules"), join(bare, "node_modules"), "junction"); // root only, like the old worktree
    const opts = { exec: new ExecaExec(), fs: new NodeFs(), cwd: bare, runner: "vitest" as const, files: ["packages/b/test/b.test.js"], timeoutMs: 120_000, env: ENV };
    const raw = await runTests({ ...opts, classifyEnvironment: false });
    expect(raw.failed).toBeGreaterThan(0);
    expect(raw.environmentError).toBeNull();
    const classified = await runTests(opts);
    expect(classified.failed).toBeGreaterThan(0);
    expect(classified.environmentError).toMatch(/setup problem, not an assertion/);
    expect(failuresAreEnvironment(raw)).toBe(true);
  }, 180_000);

  it("a pre-existing built package: tests_pass in place ✓; when only a worktree is possible it is `!`, never ✗", async () => {
    const dir = workspace("ws-dist", true);
    put(dir, "packages/b/src/b.js", 'import { one } from "@ws/a";\nexport const two = () => one() + 1;\nexport const three = () => two() + 1;\n');
    put(dir, "packages/b/test/b.test.js", TEST_B(3));
    const summary = "All 2 tests pass.";
    const inPlace = (await verifyLocal({ repoPath: dir, summary, exec: true, offline: true, save: false }, { ...ENV, NOCAP_OFFLINE: "1" })).receipt;
    expect(claim(inPlace, "tests_pass")?.status).toBe("verified");

    // Explicit --head HEAD with a dirty tree cannot run in place; dist/ is gitignored so the worktree has no built package.
    const head = git(dir, "rev-parse", "HEAD");
    const wt = (await verifyLocal({ repoPath: dir, summary, head, exec: true, offline: true, save: false }, { ...ENV, NOCAP_OFFLINE: "1" })).receipt;
    const v = claim(wt, "tests_pass");
    expect(v?.status).toBe("unverifiable");
    expect(v?.reason).toMatch(/missing, not failing/);
    expect(wt.overall).not.toBe("FAIL");
  }, 240_000);

  it("Bitecheck rebuilds workspace output after the revert, so a stale dist cannot hide a toothless test or fake a pass", async () => {
    const dir = workspace("ws-rebuild", true);
    put(dir, "packages/a/src/index.js", "export const one = () => 10;\n");
    execFileSync("node", ["packages/a/build.mjs"], { cwd: dir });
    put(dir, "packages/b/src/b.js", 'import { one } from "@ws/a";\nexport const two = () => one() + 1;\nexport const three = () => two() + 1;\n');
    put(dir, "packages/b/test/b.test.js", `import { expect, it } from "vitest";\nimport { two } from "../src/b.js";\nit("two follows one", () => expect(two()).toBe(11));\n`);
    const { receipt } = await verifyLocal({ repoPath: dir, summary: "Added tests for two in packages/b/test/b.test.js.", exec: true, offline: true, save: false, allowBuild: true }, { ...ENV, NOCAP_OFFLINE: "1" });
    expect(claim(receipt, "tests_added")?.bitecheck?.outcome).toBe("bites");
  }, 240_000);

  it("without --allow-build the same run is `environment`: nothing is built, nothing is accused", async () => {
    const dir = workspace("ws-nobuild-default", true);
    put(dir, "packages/a/src/index.js", "export const one = () => 10;\n");
    execFileSync("node", ["packages/a/build.mjs"], { cwd: dir });
    put(dir, "packages/b/test/b.test.js", `import { expect, it } from "vitest";\nimport { two } from "../src/b.js";\nit("two follows one", () => expect(two()).toBe(11));\n`);
    rmSync(join(dir, "packages/a/dist"), { recursive: true, force: true }); // as in a fresh checkout the build output is absent
    execFileSync("node", ["packages/a/build.mjs"], { cwd: dir });
    const { receipt } = await verifyLocal({ repoPath: dir, summary: "Added tests for two in packages/b/test/b.test.js.", exec: true, offline: true, save: false }, { ...ENV, NOCAP_OFFLINE: "1" });
    const v = claim(receipt, "tests_added");
    expect(v?.bitecheck?.outcome).not.toBe("toothless");
    expect(v?.status).not.toBe("contradicted");
  }, 240_000);
});

describe("workspace helpers", () => {
  it("lists packages, finds nested node_modules, detects built entry points and the build command", async () => {
    const dir = workspace("ws-helpers", true);
    const fs = new NodeFs();
    const pkgs = await listWorkspacePackages(fs, dir);
    expect(pkgs.map((p) => `${p.name}:${p.usesDist}`).sort()).toEqual(["@ws/a:true", "@ws/b:false"]);
    expect(await findNestedNodeModules(fs, dir)).toEqual(["packages/b"]);
    expect(pkgs.find((p) => p.name === "@ws/a")?.builtEntries).toEqual(["dist/index.js"]);
    expect(await packagesMissingBuild(fs, dir, pkgs)).toEqual([]); // dist/ was built in the fixture
    await rm(join(dir, "packages/a/dist"), { recursive: true, force: true });
    expect((await packagesMissingBuild(fs, dir, pkgs)).map((p) => p.name)).toEqual(["@ws/a"]);
    expect(await detectBuildCommand(fs, dir)).toEqual({ file: "npm", args: ["run", "build"] });
  }, 60_000);

  it("reads pnpm-workspace.yaml globs", async () => {
    const dir = join(tmp, "pnpm-ws");
    put(dir, "package.json", "{}");
    put(dir, "pnpm-workspace.yaml", 'packages:\n  - "libs/*"\n  - "!libs/skip"\n');
    put(dir, "libs/x/package.json", JSON.stringify({ name: "x", exports: { ".": "./dist/index.js" } }));
    const pkgs = await listWorkspacePackages(new NodeFs(), dir);
    expect(pkgs).toEqual([{ name: "x", dir: "libs/x", usesDist: true, builtEntries: ["dist/index.js"] }]);
    expect(await detectBuildCommand(new NodeFs(), dir)).toEqual({ file: "pnpm", args: ["-r", "build"] });
  });
});

describe("environment classification", () => {
  it("matches resolution and setup errors, not assertions", () => {
    for (const m of ["Cannot find module '@ws/a'", "Failed to resolve import \"x\" from \"y\"", "Error [ERR_MODULE_NOT_FOUND]: x", "Cannot find package 'p' imported from /a", "ModuleNotFoundError: No module named 'x'", "Failed to resolve entry for package \"@ws/a\""]) expect(isEnvironmentMessage(m), m).toBe(true);
    for (const m of ["AssertionError: expected 2 to be 3", "expected undefined to be 6", "TypeError: x is not a function"]) expect(isEnvironmentMessage(m), m).toBe(false);
  });
  it("a mix of resolution errors and real assertion failures is a real failure", () => {
    const run = { failed: 2, tests: [{ file: "a", title: "t", fullName: "t", status: "failed", message: "AssertionError: expected 1 to be 2" }], suiteErrors: [{ file: "b", message: "Cannot find module 'x'" }] };
    expect(failuresAreEnvironment(run)).toBe(false);
    expect(failuresAreEnvironment({ ...run, tests: [] })).toBe(true);
    expect(failuresAreEnvironment({ failed: 0, tests: [], suiteErrors: [] })).toBe(false);
  });
  it("a bare run that collects under 50% of the in-place count was missing files", () => {
    expect(collectedTooFew(30, 65)).toBe(true);
    expect(collectedTooFew(40, 65)).toBe(false);
    expect(collectedTooFew(0, 0)).toBe(false);
  });
});

describe("one source of truth for totals", () => {
  it("passed + failed + skipped === total in every parser, suite errors included", () => {
    const jest = JSON.stringify({
      testResults: [
        { name: "/r/a.test.ts", status: "passed", assertionResults: [{ title: "p", status: "passed" }, { title: "f", status: "failed", failureMessages: ["x"] }, { title: "s", status: "pending" }] },
        { name: "/r/b.test.ts", status: "failed", message: "Cannot find module", assertionResults: [] },
      ],
    });
    const j = parseJestJson(jest, "/r")!;
    expect(j).toMatchObject({ total: 4, passed: 1, failed: 2, skipped: 1 });
    expect(j.passed + j.failed + j.skipped).toBe(j.total);
    const x = parseJunit('<testsuite><testcase name="a"/><testcase name="b"><failure message="m"/></testcase><testcase name="c"><skipped/></testcase></testsuite>')!;
    expect(x.passed + x.failed + x.skipped).toBe(x.total);
    expect(tally([], [{ file: "a", message: "m" }])).toEqual({ total: 1, passed: 0, failed: 1, skipped: 0 });
  });
});

describe("nocap never installs dependencies", () => {
  /** A stand-in `pnpm` that records how it was called and behaves like pnpm 11: it "installs" unless the guard is off. */
  function fakePnpm(logDir: string): string {
    const bin = join(logDir, "bin");
    put(bin, "pnpm", `#!/bin/sh\necho "args=$* guard=$pnpm_config_verify_deps_before_run cwd=$PWD" >> "${join(logDir, "pnpm.log")}"\nif [ "$pnpm_config_verify_deps_before_run" != "false" ]; then echo installed >> "${join(logDir, "INSTALL-RAN")}"; fi\nexec node packages/a/build.mjs\n`);
    execFileSync("chmod", ["+x", join(bin, "pnpm")]);
    return bin;
  }

  it("Bitecheck's workspace build runs `pnpm -r build` with the dependency check switched off", async () => {
    const dir = workspace("ws-pnpm", true);
    put(dir, "pnpm-workspace.yaml", 'packages:\n  - "packages/*"\n');
    git(dir, "add", "-A");
    git(dir, "commit", "-q", "-m", "pnpm workspace");
    const logs = join(tmp, "pnpm-logs");
    const bin = fakePnpm(logs);
    put(dir, "packages/a/src/index.js", "export const one = () => 10;\n");
    execFileSync("node", ["packages/a/build.mjs"], { cwd: dir });
    put(dir, "packages/b/test/b.test.js", `import { expect, it } from "vitest";\nimport { two } from "../src/b.js";\nit("two follows one", () => expect(two()).toBe(11));\n`);
    const { receipt } = await verifyLocal({ repoPath: dir, summary: "Added tests for two in packages/b/test/b.test.js.", exec: true, offline: true, save: false, allowBuild: true }, { ...ENV, PATH: `${bin}:${ENV.PATH}`, NOCAP_OFFLINE: "1" });
    expect(claim(receipt, "tests_added")?.bitecheck?.outcome).toBe("bites");
    const log = (await import("node:fs")).readFileSync(join(logs, "pnpm.log"), "utf8");
    expect(log).toContain("args=-r build");
    expect(log.split("\n").filter(Boolean).every((l) => l.includes("guard=false"))).toBe(true);
    expect((await import("node:fs")).existsSync(join(logs, "INSTALL-RAN"))).toBe(false);
  }, 240_000);

  it("every child environment carries the guard, including user test commands", async () => {
    const { childEnvFrom } = await import("../src/adapters/local");
    const { safeEnv, NO_INSTALL_ENV } = await import("../src/exec/safeEnv");
    expect(childEnvFrom({ PATH: "/bin", HOME: "/h", pnpm_config_verify_deps_before_run: "install" }).pnpm_config_verify_deps_before_run).toBe("false");
    expect(safeEnv({ PATH: "/bin", ...{ pnpm_config_verify_deps_before_run: "install" } })).toMatchObject(NO_INSTALL_ENV);
  });

  it("warns loudly if the user's node_modules state file changes during a run", async () => {
    const { createExecStage } = await import("../src/exec/stage");
    const { SimpleGitPort } = await import("../src/adapters/git.simple");
    const dir = workspace("ws-guard", false);
    put(dir, "node_modules-state-probe", "x"); // keep the repo non-empty
    const warnings: string[] = [];
    const real = new NodeFs();
    const state = join(dir, "node_modules", ".modules.yaml");
    // the fixture's node_modules is a symlink to the real one; probe through a private directory instead
    const priv = await mkdtemp(join(tmp, "priv-"));
    put(priv, "node_modules/.modules.yaml", "a");
    const git2 = new SimpleGitPort(priv);
    execFileSync("git", ["init", "-q", "-b", "main"], { cwd: priv });
    put(priv, "x.txt", "1");
    git(priv, "add", "x.txt");
    git(priv, "commit", "-q", "-m", "c");
    const stage = createExecStage({ git: git2, exec: new ExecaExec(), fs: real, runId: "guard", timeoutMs: 30_000, env: ENV, allowBuild: true, onWarning: (m) => warnings.push(m) });
    await stage.runCommand("npm test", { repoRoot: priv, headSha: git(priv, "rev-parse", "HEAD") }); // creates the (writable) worktree
    writeFileSync(join(priv, "node_modules", ".modules.yaml"), "changed by something else");
    await stage.dispose?.();
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain(".modules.yaml changed");
    expect(state).toContain("node_modules");
  }, 60_000);
});

describe("build only when needed; uncommitted-file failures are not failures", () => {
  it("importedWorkspaceNames follows relative imports, including ESM-style .js specifiers for .ts files", async () => {
    const { importedWorkspaceNames } = await import("../src/git/workspace");
    const dir = join(tmp, "imports");
    put(dir, "test/t.test.ts", 'import { x } from "../src/x.js";\nimport "vitest";\n');
    put(dir, "src/x.ts", 'import { y } from "./deep/y";\nexport const x = y;\n');
    put(dir, "src/deep/y/index.ts", 'import { a } from "@ws/a/sub";\nexport const y = a;\n');
    const names = await importedWorkspaceNames(new NodeFs(), dir, ["test/t.test.ts"], ["@ws/a", "@ws/b"]);
    expect([...names]).toEqual(["@ws/a"]);
    expect([...(await importedWorkspaceNames(new NodeFs(), dir, ["src/deep/y/index.ts"], ["@ws/b"]))]).toEqual([]);
  });

  it("Bitecheck does not run the workspace build when the selected tests never reach built output", async () => {
    const dir = workspace("ws-nobuild", true);
    // a build that would fail if anyone ran it
    put(dir, "package.json", JSON.stringify({ name: "root", private: true, workspaces: ["packages/*"], scripts: { test: "vitest run", build: "node -e \"process.exit(1)\"" } }));
    put(dir, "packages/c/package.json", JSON.stringify({ name: "@ws/c", type: "module" }));
    put(dir, "packages/c/src/c.js", "export const c = () => 1;\n");
    git(dir, "add", "-A");
    git(dir, "commit", "-q", "-m", "c");
    put(dir, "packages/c/src/c.js", "export const c = () => 2;\n");
    put(dir, "packages/c/test/c.test.js", `import { expect, it } from "vitest";\nimport { c } from "../src/c.js";\nit("c is two", () => expect(c()).toBe(2));\n`);
    const { receipt } = await verifyLocal({ repoPath: dir, summary: "Added tests for c in packages/c/test/c.test.js.", exec: true, offline: true, save: false }, { ...ENV, NOCAP_OFFLINE: "1" });
    expect(claim(receipt, "tests_added")?.bitecheck?.outcome).toBe("bites");
  }, 240_000);

  it("a test that fails only in a clean checkout, because it needs an uncommitted file, is `!`, never ✗", async () => {
    const dir = join(tmp, "uncommitted");
    put(dir, "package.json", JSON.stringify({ name: "u", type: "module", scripts: { test: "vitest run" } }));
    put(dir, ".gitignore", "node_modules\ngen\n");
    put(dir, "test/ok.test.js", `import { expect, it } from "vitest";\nit("ok", () => expect(1).toBe(1));\n`);
    put(dir, "test/gen.test.js", `import { readFileSync } from "node:fs";\nimport { expect, it } from "vitest";\nit("reads generated data", () => expect(readFileSync(new URL("../gen/data.json", import.meta.url), "utf8")).toContain("ok"));\n`);
    git(dir, "init", "-q", "-b", "main");
    git(dir, "add", "-A");
    git(dir, "commit", "-q", "-m", "base");
    symlinkSync(join(ROOT, "node_modules"), join(dir, "node_modules"), "junction");
    put(dir, "gen/data.json", '{"v":"ok"}\n'); // generated, gitignored: present in place, absent in a clean checkout
    put(dir, "NOTES.md", "dirty tree so --head HEAD cannot run in place\n");
    const summary = "All 2 tests pass.";
    const head = git(dir, "rev-parse", "HEAD");
    const inPlace = (await verifyLocal({ repoPath: dir, summary, exec: true, offline: true, save: false }, { ...ENV, NOCAP_OFFLINE: "1" })).receipt;
    expect(claim(inPlace, "tests_pass")?.status).toBe("verified");
    const bare = (await verifyLocal({ repoPath: dir, summary, head, exec: true, offline: true, save: false }, { ...ENV, NOCAP_OFFLINE: "1" })).receipt;
    const v = claim(bare, "tests_pass");
    expect(v?.status).toBe("unverifiable");
    expect(v?.reason).toMatch(/depend on uncommitted files|depends on uncommitted/);
    expect(bare.overall).not.toBe("FAIL");
  }, 240_000);

  it("a genuinely failing test still fails in place and is ✗", async () => {
    const dir = join(tmp, "really-failing");
    put(dir, "package.json", JSON.stringify({ name: "r", type: "module", scripts: { test: "vitest run" } }));
    put(dir, ".gitignore", "node_modules\n");
    put(dir, "test/bad.test.js", `import { expect, it } from "vitest";\nit("bad", () => expect(1).toBe(2));\n`);
    git(dir, "init", "-q", "-b", "main");
    git(dir, "add", "-A");
    git(dir, "commit", "-q", "-m", "base");
    symlinkSync(join(ROOT, "node_modules"), join(dir, "node_modules"), "junction");
    put(dir, "NOTES.md", "x\n");
    const { receipt } = await verifyLocal({ repoPath: dir, summary: "All tests pass.", exec: true, offline: true, save: false }, { ...ENV, NOCAP_OFFLINE: "1" });
    expect(claim(receipt, "tests_pass")?.status).toBe("contradicted");
  }, 120_000);
});

describe("no-install guard for npm and yarn", () => {
  function fakeManager(logDir: string, name: "npm" | "yarn"): string {
    const bin = join(logDir, `bin-${name}`);
    put(bin, name, `#!/bin/sh\necho "${name} $* offline=$npm_config_offline audit=$npm_config_audit lock=$npm_config_package_lock net=$YARN_ENABLE_NETWORK immutable=$YARN_ENABLE_IMMUTABLE_INSTALLS pnpm=$pnpm_config_verify_deps_before_run pyc=$PYTHONDONTWRITEBYTECODE" >> "${join(logDir, `${name}.log`)}"\nexec node packages/a/build.mjs\n`);
    execFileSync("chmod", ["+x", join(bin, name)]);
    return bin;
  }
  const bitecheckWith = async (dir: string, bin: string) => {
    put(dir, "packages/a/src/index.js", "export const one = () => 10;\n");
    execFileSync("node", ["packages/a/build.mjs"], { cwd: dir });
    put(dir, "packages/b/test/b.test.js", `import { expect, it } from "vitest";\nimport { two } from "../src/b.js";\nit("two follows one", () => expect(two()).toBe(11));\n`);
    return verifyLocal({ repoPath: dir, summary: "Added tests for two in packages/b/test/b.test.js.", exec: true, offline: true, save: false, allowBuild: true }, { ...ENV, PATH: `${bin}:${ENV.PATH}`, NOCAP_OFFLINE: "1" });
  };
  const readLog = async (p: string) => (await import("node:fs")).readFileSync(p, "utf8");

  it("npm builds run with offline, no audit, no lockfile", async () => {
    const dir = workspace("ws-npm-guard", true);
    const logs = join(tmp, "npm-logs");
    const { receipt } = await bitecheckWith(dir, fakeManager(logs, "npm"));
    expect(claim(receipt, "tests_added")?.bitecheck?.outcome).toBe("bites");
    const lines = (await readLog(join(logs, "npm.log"))).split("\n").filter(Boolean);
    expect(lines.length).toBeGreaterThan(0);
    for (const l of lines) expect(l).toMatch(/offline=true audit=false lock=false/);
  }, 240_000);

  it("yarn builds run with network off and immutable installs", async () => {
    const dir = workspace("ws-yarn-guard", true);
    put(dir, "yarn.lock", "# yarn lockfile v1\n");
    git(dir, "add", "-A");
    git(dir, "commit", "-q", "-m", "yarn");
    const logs = join(tmp, "yarn-logs");
    const { receipt } = await bitecheckWith(dir, fakeManager(logs, "yarn"));
    expect(claim(receipt, "tests_added")?.bitecheck?.outcome).toBe("bites");
    const lines = (await readLog(join(logs, "yarn.log"))).split("\n").filter(Boolean);
    expect(lines.length).toBeGreaterThan(0);
    for (const l of lines) expect(l).toMatch(/net=0 immutable=true/);
  }, 240_000);

  it("every guard variable is in the environment every child gets", async () => {
    const { childEnvFrom } = await import("../src/adapters/local");
    const { NO_INSTALL_ENV } = await import("../src/exec/safeEnv");
    const env = childEnvFrom({ PATH: "/bin", HOME: "/h", npm_config_offline: "false", YARN_ENABLE_NETWORK: "1" });
    for (const [k, v] of Object.entries(NO_INSTALL_ENV)) expect(env[k], k).toBe(v);
  });
});
