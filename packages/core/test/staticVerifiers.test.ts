import { describe, expect, it } from "vitest";
import type { Claim } from "../src/schema/claim.js";
import type { ChangedFile, ChangeSet, DiffHunk } from "../src/git/types.js";
import { verifyClaim, type VerifyContext } from "../src/verifiers/index.js";

const claim = (over: Partial<Claim>): Claim => ({
  id: "c1", quote: "q q q", type: "other", subject: null, keywords: [], paths: [], symbols: [],
  count: null, command: null, span: null, ...over,
});
const file = (path: string, status: ChangedFile["status"], extra: Partial<ChangedFile> = {}): ChangedFile => ({
  path, status, additions: 3, deletions: 1, previousPath: null, isBinary: false, ...extra,
});
const hunk = (path: string, adds: string[], dels: string[] = []): DiffHunk => ({
  path, oldStart: 1, newStart: 1,
  lines: [
    ...dels.map((c, i) => ({ type: "del" as const, content: c, oldLine: i + 1, newLine: null })),
    ...adds.map((c, i) => ({ type: "add" as const, content: c, oldLine: null, newLine: i + 1 })),
  ],
});
function ctx(files: ChangedFile[], hunks: DiffHunk[] = [], over: Partial<VerifyContext> = {}, head: Record<string, string> = {}): VerifyContext {
  const changeSet: ChangeSet = { baseSha: "a", headSha: "b", files, hunks };
  return {
    changeSet, filesAtHead: [...new Set([...files.filter((f) => f.status !== "D").map((f) => f.path), ...Object.keys(head), "src/other.ts"])],
    mappings: new Map(), suite: null, bitechecks: new Map(), commands: new Map(), flags: [], execEnabled: true,
    readFileAtHead: async (p) => head[p] ?? null, ...over,
  };
}
const status = async (c: Claim, x: VerifyContext) => (await verifyClaim(c, x)).status;

describe("fileSet", () => {
  it("created: verified, contradicted, unverifiable", async () => {
    const x = ctx([file("src/a.ts", "A")]);
    expect(await status(claim({ type: "file_created", paths: ["src/a.ts"] }), x)).toBe("verified");
    expect(await status(claim({ type: "file_created", paths: ["src/zzz.ts"] }), x)).toBe("contradicted");
    expect(await status(claim({ type: "file_created" }), x)).toBe("unverifiable");
  });
  it("created resolves a unique basename", async () => {
    expect(await status(claim({ type: "file_created", paths: ["a.ts"] }), ctx([file("src/a.ts", "A")]))).toBe("verified");
  });
  it("modified / deleted / renamed", async () => {
    const x = ctx([file("src/m.ts", "M"), file("src/d.ts", "D"), file("src/n.ts", "R", { previousPath: "src/o.ts" })]);
    expect(await status(claim({ type: "file_modified", paths: ["src/m.ts"] }), x)).toBe("verified");
    expect(await status(claim({ type: "file_modified", paths: ["src/other.ts"] }), x)).toBe("contradicted");
    expect(await status(claim({ type: "file_deleted", paths: ["src/d.ts"] }), x)).toBe("verified");
    expect(await status(claim({ type: "file_deleted", paths: ["src/other.ts"] }), x)).toBe("contradicted");
    expect(await status(claim({ type: "file_renamed", paths: ["src/o.ts", "src/n.ts"] }), x)).toBe("verified");
    expect(await status(claim({ type: "file_renamed", paths: ["x.ts", "y.ts"] }), x)).toBe("contradicted");
  });
});

describe("scope", () => {
  const mapping = { concept: "auth", globs: ["src/auth/**"], matchedFiles: ["src/auth/session.ts"] };
  const withMap = (files: ChangedFile[]) => ctx(files, [hunk("src/auth/session.ts", ["x"])], { mappings: new Map([["auth", mapping]]) });
  it("scope_none", async () => {
    const c = claim({ type: "scope_none", subject: "auth" });
    expect(await status(c, withMap([file("src/retry.ts", "M")]))).toBe("verified");
    expect(await status(c, withMap([file("src/auth/session.ts", "M")]))).toBe("contradicted");
    expect(await status(c, ctx([file("src/retry.ts", "M")]))).toBe("unverifiable");
  });
  it("scope_only ignores lockfiles", async () => {
    const c = claim({ type: "scope_only", subject: "auth" });
    expect(await status(c, withMap([file("src/auth/session.ts", "M"), file("pnpm-lock.yaml", "M")]))).toBe("verified");
    expect(await status(c, withMap([file("src/auth/session.ts", "M"), file("src/retry.ts", "M")]))).toBe("contradicted");
    expect(await status(c, ctx([]))).toBe("unverifiable");
  });
});

describe("count", () => {
  const files = Array.from({ length: 5 }, (_, i) => file(`f${i}.ts`, "M"));
  it("tolerance", async () => {
    expect(await status(claim({ type: "count_files_changed", count: 5 }), ctx(files))).toBe("verified");
    expect(await status(claim({ type: "count_files_changed", count: 6 }), ctx(files))).toBe("verified");
    expect(await status(claim({ type: "count_files_changed", count: 12 }), ctx(files))).toBe("contradicted");
    expect(await status(claim({ type: "count_files_changed" }), ctx(files))).toBe("unverifiable");
  });
});

describe("symbol", () => {
  it("verified / contradicted / text-match", async () => {
    const x = ctx([file("src/b.ts", "A")], [hunk("src/b.ts", ["export function withBackoff() {}"])], {}, { "src/b.ts": "export function withBackoff() {}" });
    expect(await status(claim({ type: "symbol_added", symbols: ["withBackoff"] }), x)).toBe("verified");
    expect(await status(claim({ type: "symbol_added", symbols: ["nope"] }), x)).toBe("contradicted");
    const py = ctx([file("a.py", "A")], [hunk("a.py", ["def go(): pass"])]);
    const v = await verifyClaim(claim({ type: "symbol_added", symbols: ["go"] }), py);
    expect(v.status).toBe("verified");
    expect(v.evidence.some((e) => e.kind === "note")).toBe(true);
    expect(await status(claim({ type: "symbol_added" }), x)).toBe("unverifiable");
  });
});

describe("dependency", () => {
  const x = ctx([file("package.json", "M")], [hunk("package.json", ['"zod": "^3.0.0"'], ['"left-pad": "1.0.0"'])]);
  it("added / removed / unchanged / no manifest", async () => {
    expect(await status(claim({ type: "dependency_added", symbols: ["zod"] }), x)).toBe("verified");
    expect(await status(claim({ type: "dependency_removed", symbols: ["left-pad"] }), x)).toBe("verified");
    expect(await status(claim({ type: "dependency_added", symbols: ["axios"] }), x)).toBe("contradicted");
    expect(await status(claim({ type: "dependency_added", symbols: ["zod"] }), ctx([file("src/a.ts", "M")]))).toBe("unverifiable");
  });
});

describe("exec-backed claims", () => {
  const suite = { runner: "vitest", total: 9, passed: 9, failed: 0, skipped: 0, durationMs: 1, tests: [], suiteErrors: [], exitCode: 0, stderrTail: "", environmentError: null };
  it("tests_pass", async () => {
    expect(await status(claim({ type: "tests_pass", count: 9 }), ctx([], [], { suite }))).toBe("verified");
    expect(await status(claim({ type: "tests_pass", count: 12 }), ctx([], [], { suite }))).toBe("contradicted");
    expect(await status(claim({ type: "tests_pass" }), ctx([], [], { suite: { ...suite, failed: 1 } }))).toBe("contradicted");
    expect(await status(claim({ type: "tests_pass" }), ctx([], [], { suite, execEnabled: false }))).toBe("unverifiable");
  });
  it("tests_added maps Bitecheck outcomes; never verified under --no-exec", async () => {
    const bc = (outcome: "bites" | "toothless" | "import_only" | "broken_on_head" | "environment" | "no_matching_tests") =>
      ({ outcome, mode: "revert" as const, stubbed: [] as string[], selectedTests: [], revertedFiles: [], deletedForRevert: [], head: null, reverted: null });
    const run = (o: Parameters<typeof bc>[0], files: ChangedFile[] = []) =>
      status(claim({ type: "tests_added" }), ctx(files, [], { bitechecks: new Map([["c1", bc(o)]]) }));
    expect(await run("bites")).toBe("verified");
    expect(await run("import_only")).toBe("verified");
    expect(await run("toothless")).toBe("contradicted");
    expect(await run("environment")).toBe("unverifiable");
    expect(await run("no_matching_tests")).toBe("contradicted");
    expect(await run("no_matching_tests", [file("test/a.test.ts", "M")])).toBe("unverifiable");
    expect(await status(claim({ type: "tests_added" }), ctx([], [], { execEnabled: false }))).toBe("unverifiable");
  });
  it("refactor: test edits contradict", async () => {
    expect(await status(claim({ type: "refactor_no_behavior_change" }), ctx([file("test/a.test.ts", "M")]))).toBe("contradicted");
    expect(await status(claim({ type: "refactor_no_behavior_change" }), ctx([file("src/a.ts", "M")], [], { suite }))).toBe("verified");
    expect(await status(claim({ type: "refactor_no_behavior_change" }), ctx([file("src/a.ts", "M")], [], { execEnabled: false }))).toBe("unverifiable");
  });
  it("build_pass by exit code", async () => {
    const cmd = (exitCode: number) => new Map([["tsc", { exitCode, durationMs: 1, stderrTail: "", command: "tsc" }]]);
    expect(await status(claim({ type: "build_pass", command: "tsc" }), ctx([], [], { commands: cmd(0) }))).toBe("verified");
    expect(await status(claim({ type: "build_pass", command: "tsc" }), ctx([], [], { commands: cmd(2) }))).toBe("contradicted");
    expect(await status(claim({ type: "build_pass", command: "tsc" }), ctx([]))).toBe("unverifiable");
  });
  it("other is always unverifiable", async () => {
    expect(await status(claim({ type: "other" }), ctx([]))).toBe("unverifiable");
  });
});
