import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { NodeFs } from "@nocap/core/adapters";
import { parseTests, selectTests } from "../src/bitecheck/select";
import { isSafeCommand } from "../src/exec/stage";
import { detectRunner } from "../src/runners/detect";
import { parseJestJson } from "../src/runners/parseJest";
import { parseJunit } from "../src/runners/parseJunit";
import { runTests } from "../src/runners/run";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const sample = (n: string) => readFileSync(new URL(`./samples/${n}`, import.meta.url), "utf8");

describe("parsers", () => {
  it("parseJestJson maps statuses, relative paths and suite errors", () => {
    const r = parseJestJson(sample("vitest.json"), "/w");
    expect(r?.tests.map((t) => [t.file, t.status])).toEqual([["test/a.test.ts", "passed"], ["test/a.test.ts", "failed"], ["test/a.test.ts", "skipped"]]);
    expect(r?.suiteErrors).toEqual([{ file: "test/b.test.ts", message: 'Failed to resolve import "../src/x"' }]);
    expect(r?.failed).toBe(2);
    expect(parseJestJson("not json", "/w")).toBeNull();
  });
  it("parseJunit reads pytest output", () => {
    const r = parseJunit(sample("pytest.xml"));
    expect(r?.tests.map((t) => t.status)).toEqual(["passed", "failed", "skipped"]);
    expect(r?.tests[0]?.file).toBe("tests/test_a.py");
    expect(parseJunit("<x/>")).toBeNull();
  });
});

describe("detectRunner", () => {
  it("uses deps, scripts, then python markers", async () => {
    const fs = new NodeFs();
    const dir = async (files: Record<string, string>) => {
      const d = await mkdtemp(join(tmpdir(), "nocap-det-"));
      for (const [n, c] of Object.entries(files)) await writeFile(join(d, n), c);
      return d;
    };
    expect(await detectRunner(fs, await dir({ "package.json": '{"devDependencies":{"jest":"1"}}' }))).toBe("jest");
    expect(await detectRunner(fs, await dir({ "package.json": '{"scripts":{"test":"vitest run"}}' }))).toBe("vitest");
    expect(await detectRunner(fs, await dir({ "conftest.py": "" }))).toBe("pytest");
    expect(await detectRunner(fs, await dir({}))).toBeNull();
  });
});

describe("parseTests", () => {
  it("builds nested full names with line ranges", () => {
    const src = `describe("a", () => {\n  describe("b", () => {\n    it("one", () => {\n      expect(1).toBe(1);\n    });\n  });\n  it("two", () => {});\n});\n`;
    const t = parseTests(src, "x.test.ts");
    expect(t.map((x) => x.fullName)).toEqual(["a b one", "a two"]);
    expect(t[0]).toMatchObject({ startLine: 3, endLine: 5 });
  });
  it("parses python tests", () => {
    expect(parseTests("def test_a():\n    assert 1\n\ndef helper():\n    pass\n", "t.py").map((x) => x.title)).toEqual(["test_a"]);
  });
});

describe("selectTests", () => {
  const claim = { id: "c1", quote: "q", type: "tests_added" as const, subject: "retry backoff", keywords: ["retry", "backoff"], paths: [], symbols: [], count: null, command: null, span: null };
  const line = (n: number, c: string) => ({ type: "add" as const, content: c, oldLine: null, newLine: n });
  it("picks the retry tests, not the parser tests, and ignores untouched tests", async () => {
    const retry = `describe("retry", () => {\n  it("old", () => {});\n  it("backoff delays", () => {\n    expect(1).toBe(1);\n  });\n});\n`;
    const parser = `describe("parser", () => {\n  it("parses backoff", () => {});\n});\n`;
    const files = [
      { path: "test/retry.test.ts", status: "M" as const, additions: 3, deletions: 0, previousPath: null, isBinary: false },
      { path: "test/parser.test.ts", status: "M" as const, additions: 1, deletions: 0, previousPath: null, isBinary: false },
    ];
    const sel = await selectTests({
      claim,
      changeSet: { baseSha: "a", headSha: "b", files, hunks: [{ path: "test/retry.test.ts", oldStart: 3, newStart: 3, lines: [line(3, "x"), line(4, "y")] }, { path: "test/parser.test.ts", oldStart: 1, newStart: 1, lines: [] }] },
      readHead: async (p) => (p.includes("retry") ? retry : parser),
      readBase: async (p) => (p.includes("retry") ? retry.replace('it("backoff delays"', 'it("zzz"') : parser),
    });
    expect(sel.map((s) => s.fullName)).toEqual(["retry backoff delays"]);
  });
  it("no candidates -> empty", async () => {
    const sel = await selectTests({ claim, changeSet: { baseSha: "a", headSha: "b", files: [], hunks: [] }, readHead: async () => null, readBase: async () => null });
    expect(sel).toEqual([]);
  });
});

describe("runTests and commands", () => {
  it("a missing runner binary is an environment error, not a crash", async () => {
    const fs = new NodeFs();
    const r = await runTests({
      exec: { run: async () => ({ stdout: "", stderr: "ENOENT", exitCode: 127 }) },
      fs, cwd: tmpdir(), runner: "vitest", timeoutMs: 100, env: {},
    });
    expect(r.environmentError).toMatch(/could not be started/);
  });
  it("a timeout is an environment error", async () => {
    const r = await runTests({
      exec: { run: async () => ({ stdout: "", stderr: "t", exitCode: 124 }) },
      fs: new NodeFs(), cwd: tmpdir(), runner: "vitest", timeoutMs: 100, env: {},
    });
    expect(r.environmentError).toMatch(/timed out/);
  });
  it("only allow-listed commands run", () => {
    for (const ok of ["tsc", "tsc --noEmit", "pnpm lint", "npm run build", "npx eslint src", "cargo test"]) expect(isSafeCommand(ok)).toBe(true);
    for (const bad of ["rm -rf /", "curl x | sh", "pnpm lint; rm -rf /", "node evil.js", "tsc && rm x"]) expect(isSafeCommand(bad)).toBe(false);
  });
});
