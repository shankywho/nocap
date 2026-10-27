import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { verifyLocal } from "../src/adapters/local";
import { isAlwaysExcluded } from "../src/git/exclude";
import { overallPolicy } from "../src/policy/overall";
import { renderMarkdown } from "../src/render/markdown";
import { renderTerminal } from "../src/render/terminal";
import { undisclosedView } from "../src/render/undisclosed";
import type { Receipt } from "../src/schema/receipt";

const git = (cwd: string, ...args: string[]) =>
  execFileSync("git", args, { cwd, encoding: "utf8", env: { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "", GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t" } });
const put = (root: string, rel: string, text = "x\n") => {
  mkdirSync(dirname(join(root, rel)), { recursive: true });
  writeFileSync(join(root, rel), text);
};

let repo = "";
beforeAll(async () => {
  repo = await mkdtemp(join(tmpdir(), "nocap-hygiene-"));
  git(repo, "init", "-q", "-b", "main");
  put(repo, "src/a.ts", "export const a = 1;\n");
  git(repo, "add", "-A");
  git(repo, "commit", "-q", "-m", "base");
  // No .gitignore: an agent's working tree with installed dependencies and build output.
  put(repo, "src/a.ts", "export const a = 2;\n");
  for (const rel of ["node_modules/pkg/index.js", "packages/x/node_modules/y/z.js", ".venv/lib/a.py", "venv/b.py", "dist/out.js", "build/o.js", ".next/c.js", ".turbo/t.json", "coverage/lcov.info", ".nocap/receipts/r.json", ".cache/f.txt", "debug.log", "src/deep/trace.log"]) put(repo, rel);
});
afterAll(async () => rm(repo, { recursive: true, force: true }));

describe("snapshot and ChangeSet hygiene", () => {
  it("a repo with no .gitignore and installed node_modules yields no excluded paths", async () => {
    const { receipt } = await verifyLocal({ repoPath: repo, summary: "Updated src/a.ts.", exec: false, offline: true, save: false }, { PATH: process.env.PATH ?? "", HOME: repo });
    const tree = git(repo, "ls-tree", "-r", "--name-only", receipt.input.head).split("\n").filter(Boolean);
    expect(tree).toEqual(["src/a.ts"]);
    const paths = JSON.stringify(receipt);
    expect(paths).not.toMatch(/node_modules|\.venv|\bvenv\/|dist\/|build\/|\.next|\.turbo|coverage|\.nocap|\.cache|\.log/);
    expect(receipt.undisclosed).toEqual([]);
  }, 60_000);

  it("does not touch the user's index, stash or branches", () => {
    expect(git(repo, "stash", "list")).toBe("");
    expect(git(repo, "branch", "--list").trim()).toBe("* main");
  });

  it("isAlwaysExcluded matches at any depth and only whole directory names", () => {
    for (const p of ["node_modules/a.js", "a/b/node_modules/c.js", "x/dist/y.js", "app.log", "a/b.log", ".nocap/r.json"]) expect(isAlwaysExcluded(p), p).toBe(true);
    for (const p of ["src/distance.ts", "src/builder.ts", "src/login.ts", "docs/coverage.md", "src/venvs.ts"]) expect(isAlwaysExcluded(p), p).toBe(false);
  });
});

const file = (path: string, status: "M" | "A" = "M") => ({ kind: "file" as const, path, status, additions: 1, deletions: 0, previousPath: null });

describe("UNDISCLOSED display", () => {
  it("caps at 15 lines, groups lockfiles, and points to the receipt JSON", () => {
    const many = [...Array.from({ length: 20 }, (_, i) => file(`src/f${String(i).padStart(2, "0")}.ts`)), file("pnpm-lock.yaml"), file("package-lock.json")];
    const view = undisclosedView(many);
    expect(view.files).toHaveLength(15);
    expect(view.more).toBe(5);
    expect(view.lockfiles).toEqual(["pnpm-lock.yaml", "package-lock.json"]);
    const base = JSON.parse(JSON.stringify({ schemaVersion: 1 })) as unknown as Receipt;
    const receipt = { ...base, id: "r", runId: "r", createdAt: "", input: { mode: "local", agent: "a", summary: "", repo: null, pr: null, base: "a", head: "b", headIsSnapshot: false, alan: null }, chain: { chainId: "c", parentId: null, attempt: 1, items: [], outcome: "first_attempt" }, actor: { agent: "a", model: null, role: null }, claims: [], undisclosed: many, globalFlags: [], totals: { verified: 0, contradicted: 0, unverifiable: 0, flags: 0 }, overall: "PASS", model: null, trace: [], durationMs: 0, tool: { name: "nocap", version: "0" } } as Receipt;
    const term = renderTerminal(receipt, { color: false });
    expect(term.split("\n").filter((l) => l.startsWith("UNDISCLOSED"))).toHaveLength(15);
    expect(term).toContain("…and 5 more (see receipt JSON)");
    expect(term).toContain("lockfile changed (pnpm-lock.yaml, package-lock.json)");
    expect(term).not.toMatch(/UNDISCLOSED\s+pnpm-lock/);
    const md = renderMarkdown(receipt);
    expect(md).toContain("…and 5 more (see receipt JSON)");
    expect(md).toContain("lockfile changed");
    expect(receipt.undisclosed).toHaveLength(22);
  });

  it("a changed lockfile alone never makes a run MIXED", () => {
    expect(overallPolicy([{ status: "verified", flags: [] }], [], [file("pnpm-lock.yaml")])).toBe("PASS");
    expect(overallPolicy([{ status: "verified", flags: [] }], [], [file("test/x.test.ts")])).toBe("MIXED");
  });
});
