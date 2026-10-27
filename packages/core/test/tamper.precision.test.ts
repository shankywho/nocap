import { describe, expect, it } from "vitest";
import type { ChangeSet, DiffHunk } from "../src/git/types";
import { buildMasks, maskFile, matchesInCode } from "../src/tamper/mask";
import { isTamperConfig, tamperFlags } from "../src/tamper/rules";

/** The exact lines the 0.1.1 dogfood run flagged by mistake. */
const HYGIENE_LINE_8 = 'import { isAlwaysExcluded } from "../src/git/exclude";';
const NODETEST_LINE_49 = '    put(dir, "test/a.test.js", `import { test, describe } from "node:test";\\nimport assert from "node:assert";\\ndescribe("math", () => {\\n  test("adds", () => assert.equal(1 + 1, 2));\\n  test("breaks", () => assert.equal(1, 2));\\n  test.skip("later", () => {});\\n});\\n`);';

const hunk = (path: string, added: string[], removed: string[] = []): DiffHunk => ({
  path,
  oldStart: 1,
  newStart: 1,
  lines: [
    ...removed.map((content, i) => ({ type: "del" as const, content, oldLine: i + 1, newLine: null })),
    ...added.map((content, i) => ({ type: "add" as const, content, oldLine: null, newLine: i + 1 })),
  ],
});
const change = (path: string, h: DiffHunk): ChangeSet => ({ baseSha: "a", headSha: "b", files: [{ path, status: "M", additions: h.lines.length, deletions: 0, previousPath: null, isBinary: false }], hunks: [h] });
const flagsFor = async (path: string, added: string[], removed: string[] = []) => {
  const h = hunk(path, added, removed);
  const masks = await buildMasks([path], async () => added.join("\n"), async () => (removed.length ? removed.join("\n") : null));
  return tamperFlags(change(path, h), masks);
};

describe("false flags from 0.1.1 dogfooding", () => {
  it("hygiene.test.ts:8, an import path containing 'exclude', raises nothing", async () => {
    expect(await flagsFor("packages/core/test/hygiene.test.ts", [HYGIENE_LINE_8])).toEqual([]);
    // even without masks: a test file is never a config file
    expect(tamperFlags(change("packages/core/test/hygiene.test.ts", hunk("packages/core/test/hygiene.test.ts", [HYGIENE_LINE_8])))).toEqual([]);
  });

  it("runners.nodeTest.test.ts:49, a test.skip( inside a template literal, raises nothing", async () => {
    expect(await flagsFor("packages/core/test/runners.nodeTest.test.ts", [NODETEST_LINE_49])).toEqual([]);
  });

  it("a real skip in code is still flagged, on the same file", async () => {
    const flags = await flagsFor("packages/core/test/a.test.ts", ['  test.skip("later", () => {});', '  it.only("focus", () => {});']);
    expect(flags.map((f) => f.rule).sort()).toEqual(["only_added", "skip_added"]);
  });

  it("a skip inside a ${} expression of a template literal is code, and flagged", async () => {
    const flags = await flagsFor("test/a.test.ts", ["const s = `before ${ it.skip(\"x\", f) } after`;"]);
    expect(flags.map((f) => f.rule)).toContain("skip_added");
  });
});

describe("literal and comment masking", () => {
  const codeAt = (path: string, text: string, line: number, needle: string) => {
    const lines = text.split("\n");
    return matchesInCode(new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), lines[line] as string, maskFile(path, text)?.[line]);
  };
  it("treats single, double and multi-line template strings as literals", () => {
    const src = 'const a = "it.skip(x)";\nconst b = \'it.skip(y)\';\nconst c = `\n  it.skip(z)\n  more\n`;\nit.skip("real", f);\n';
    expect(codeAt("a.ts", src, 0, "it.skip(")).toBe(false);
    expect(codeAt("a.ts", src, 1, "it.skip(")).toBe(false);
    expect(codeAt("a.ts", src, 3, "it.skip(")).toBe(false);
    expect(codeAt("a.ts", src, 6, "it.skip(")).toBe(true);
  });
  it("treats comments and regex literals as non-code", () => {
    const src = '// it.skip(x)\n/* it.skip(y)\n   it.skip(z) */\nconst ENV = /JEST_WORKER_ID|\\bVITEST\\b/;\nconst n = a / b; it.skip("q");\n';
    expect(codeAt("a.ts", src, 0, "it.skip(")).toBe(false);
    expect(codeAt("a.ts", src, 1, "it.skip(")).toBe(false);
    expect(codeAt("a.ts", src, 2, "it.skip(")).toBe(false);
    expect(codeAt("a.ts", src, 3, "VITEST")).toBe(false);
    expect(codeAt("a.ts", src, 4, "it.skip(")).toBe(true);
  });
  it("handles Python strings, docstrings and comments", () => {
    const src = '"""\n@pytest.mark.skip\n"""\nx = "pytest.skip(1)"  # pytest.skip(2)\n@pytest.mark.skip\ndef t(): pass\n';
    expect(codeAt("t.py", src, 1, "@pytest.mark.skip")).toBe(false);
    expect(codeAt("t.py", src, 3, "pytest.skip(")).toBe(false);
    expect(codeAt("t.py", src, 4, "@pytest.mark.skip")).toBe(true);
  });
  it("env sniffing in a regex literal of a rules file is not env sniffing", async () => {
    expect(await flagsFor("packages/core/src/tamper/rules.ts", ["const ENV_SNIFF = /JEST_WORKER_ID|\\bVITEST\\b/;"])).toEqual([]);
    expect((await flagsFor("src/app.ts", ["if (process.env.VITEST) return;"])).map((f) => f.rule)).toEqual(["env_sniffing"]);
  });
  it("unsupported languages are not masked (rules apply to the raw line)", () => {
    expect(maskFile("a.yml", "x")).toBeNull();
    expect(matchesInCode(/skip/, "skip", undefined)).toBe(true);
  });
});

describe("test_config_changed only on real config files", () => {
  it("knows the real config files", () => {
    for (const p of ["vitest.config.ts", "packages/a/jest.config.js", "pytest.ini", "pyproject.toml", "tests/conftest.py", "tsconfig.json", "apps/x/tsconfig.build.json", "package.json", ".github/workflows/ci.yml"]) expect(isTamperConfig(p), p).toBe(true);
    for (const p of ["test/a.test.ts", "eslint.config.js", "src/exclude.ts", "README.md", "docs/ci.yml", "Dockerfile", "vitest.setup.ts"]) expect(isTamperConfig(p), p).toBe(false);
  });
  it("flags tampering in real config", async () => {
    const rules = async (path: string, line: string) => (await flagsFor(path, [line])).map((f) => f.rule);
    expect(await rules("vitest.config.ts", '    exclude: ["test/legacy/**"],')).toEqual(["test_config_changed"]);
    expect(await rules("jest.config.js", "  testPathIgnorePatterns: ['/a/'],")).toEqual(["test_config_changed"]);
    expect(await rules("pytest.ini", "addopts = --deselect tests/test_a.py")).toEqual(["test_config_changed"]);
    expect(await rules(".github/workflows/ci.yml", "        continue-on-error: true")).toEqual(["test_config_changed"]);
    expect(await rules("package.json", '    "test": "echo skipped",')).toEqual(["test_config_changed"]);
    expect(await rules("tsconfig.json", '  "exclude": ["**/*.test.ts"]')).toEqual(["test_config_changed"]);
    expect((await flagsFor("vitest.config.ts", [], ['  coverageThreshold: { lines: 80 }'])).map((f) => f.rule)).toEqual(["test_config_changed"]);
  });
  it("ignores unrelated lines in the same files and in non-config files", async () => {
    const rules = async (path: string, line: string) => (await flagsFor(path, [line])).map((f) => f.rule);
    expect(await rules("package.json", '    "exclude-me": "1.0.0",')).toEqual([]);
    expect(await rules("package.json", '    "build": "tsc",')).toEqual([]);
    expect(await rules("tsconfig.json", '  "exclude": ["dist"]')).toEqual([]);
    expect(await rules("eslint.config.js", '  ignores: ["exclude"],')).toEqual([]);
    expect(await rules("src/files.ts", "const exclude = [];")).toEqual([]);
    expect(await rules("test/a.test.ts", 'const exclude = ["x"];')).toEqual([]);
  });
});
