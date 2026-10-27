import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { verifyLocal } from "../src/adapters/local";
import { ExecaExec } from "../src/adapters/exec.execa";
import { NodeFs } from "../src/adapters/fs.node";
import { detectRunner } from "../src/runners/detect";
import { isNodeTestScript, nodeTestArgs, parseNodeTestScript } from "../src/runners/nodeTest";
import { runTests } from "../src/runners/run";

describe("parseNodeTestScript", () => {
  it("recognises node --test in scripts, with loader flags and targets", () => {
    expect(parseNodeTestScript("node --test")).toEqual({ nodeArgs: [], testFlags: [], targets: [] });
    expect(parseNodeTestScript("node --import tsx --test --test-concurrency=1 test/")).toEqual({ nodeArgs: ["--import", "tsx"], testFlags: ["--test-concurrency=1"], targets: ["test/"] });
    expect(parseNodeTestScript("npm run lint && node --test test/*.test.js")?.targets).toEqual(["test/*.test.js"]);
    expect(parseNodeTestScript("node --test --test-reporter=spec")?.testFlags).toEqual([]);
  });
  it("does not match other runners or plain node scripts", () => {
    for (const s of ["vitest run", "jest", "node build.js", "echo node --test-ish", "", "npx mocha"]) expect(isNodeTestScript(s), s).toBe(false);
  });
  it("builds the junit invocation, preferring selected files over the script's targets", () => {
    const script = parseNodeTestScript("node --import tsx --test test/")!;
    expect(nodeTestArgs(script, "/tmp/o.xml", ["test/a.test.ts"], "adds|subs")).toEqual([
      "--import", "tsx", "--test", "--test-reporter=junit", "--test-reporter-destination=/tmp/o.xml", "--test-name-pattern=adds|subs", "test/a.test.ts",
    ]);
    expect(nodeTestArgs(script, "/tmp/o.xml", [], null).slice(-1)).toEqual(["test/"]);
  });
});

const run = (cwd: string, ...a: string[]) => execFileSync("git", a, { cwd, encoding: "utf8", env: { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "", GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t" } });
const put = (root: string, rel: string, text: string) => {
  mkdirSync(dirname(join(root, rel)), { recursive: true });
  writeFileSync(join(root, rel), text);
};
const PKG = JSON.stringify({ name: "p", type: "module", scripts: { test: "node --test" } });
let tmp = "";
beforeAll(async () => {
  tmp = await mkdtemp(join(tmpdir(), "nocap-nodetest-"));
});
afterAll(async () => rm(tmp, { recursive: true, force: true }));

describe("node --test runner", () => {
  it("is detected and parsed per file, with pass, fail and skip", async () => {
    const dir = join(tmp, "parse");
    put(dir, "package.json", PKG);
    put(dir, "test/a.test.js", `import { test, describe } from "node:test";\nimport assert from "node:assert";\ndescribe("math", () => {\n  test("adds", () => assert.equal(1 + 1, 2));\n  test("breaks", () => assert.equal(1, 2));\n  test.skip("later", () => {});\n});\n`);
    put(dir, "test/b.test.js", `import { test } from "node:test";\ntest("other", () => {});\n`);
    const fs = new NodeFs();
    expect(await detectRunner(fs, dir)).toBe("node");
    const r = await runTests({ exec: new ExecaExec(), fs, cwd: dir, runner: "node", files: ["test/a.test.js", "test/b.test.js"], timeoutMs: 60_000, env: { PATH: process.env.PATH ?? "" } });
    expect(r.environmentError).toBeNull();
    expect(r.tests.map((t) => `${t.file}:${t.title}:${t.status}`).sort()).toEqual(["test/a.test.js:adds:passed", "test/a.test.js:breaks:failed", "test/a.test.js:later:skipped", "test/b.test.js:other:passed"]);
    expect(r).toMatchObject({ total: 4, passed: 2, failed: 1, skipped: 1, runner: "node" });
    const only = await runTests({ exec: new ExecaExec(), fs, cwd: dir, runner: "node", files: ["test/a.test.js"], titles: ["adds"], timeoutMs: 60_000, env: { PATH: process.env.PATH ?? "" } });
    expect(only.tests.map((t) => t.title)).toEqual(["adds"]);
  }, 90_000);

  it("reports an unloadable test file as a suite error, not an environment problem", async () => {
    const dir = join(tmp, "broken");
    put(dir, "package.json", PKG);
    put(dir, "test/x.test.js", `import { nothing } from "../src/missing.js";\nnothing();\n`);
    const r = await runTests({ exec: new ExecaExec(), fs: new NodeFs(), cwd: dir, runner: "node", files: ["test/x.test.js"], timeoutMs: 60_000, env: { PATH: process.env.PATH ?? "" } });
    expect(r.environmentError).toBeNull();
    expect(r.suiteErrors.length + r.tests.length).toBeGreaterThan(0);
  }, 60_000);

  it("Bitecheck works on a node --test project: toothless vs bites", async () => {
    const dir = join(tmp, "bite");
    put(dir, "package.json", PKG);
    put(dir, "src/retry.js", "export function delay(n) {\n  return 100;\n}\n");
    run(dir, "init", "-q", "-b", "main");
    run(dir, "add", "-A");
    run(dir, "commit", "-q", "-m", "base");
    put(dir, "src/retry.js", "export function delay(n) {\n  return 100 * 2 ** n;\n}\n");
    put(dir, "test/retry.test.js", `import { test } from "node:test";\nimport assert from "node:assert";\nimport { delay } from "../src/retry.js";\ntest("retry delay is a number", () => assert.equal(typeof delay(1), "number"));\n`);
    const env = { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "", NOCAP_OFFLINE: "1" };
    const toothless = (await verifyLocal({ repoPath: dir, summary: "Added tests for retry delay in test/retry.test.js.", exec: true, offline: true, save: false }, env)).receipt;
    expect(toothless.claims.find((c) => c.claim.type === "tests_added")?.verdict.bitecheck?.outcome).toBe("toothless");

    put(dir, "test/retry.test.js", `import { test } from "node:test";\nimport assert from "node:assert";\nimport { delay } from "../src/retry.js";\ntest("retry delay doubles", () => assert.equal(delay(1), 200));\n`);
    const bites = (await verifyLocal({ repoPath: dir, summary: "Added tests for retry delay in test/retry.test.js.", exec: true, offline: true, save: false }, env)).receipt;
    const bc = bites.claims.find((c) => c.claim.type === "tests_added")?.verdict;
    expect(bc?.bitecheck?.outcome).toBe("bites");
    expect(bc?.status).toBe("verified");
  }, 120_000);
});
