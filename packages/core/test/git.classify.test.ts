import { describe, expect, it } from "vitest";
import { classifyFile, isTestPath } from "../src/git/classify";

const table: [string, string][] = [
  ["src/retry.ts", "source"],
  ["src/auth/session.ts", "source"],
  ["test/retry.test.ts", "test"],
  ["tests/retry.spec.ts", "test"],
  ["src/__tests__/retry.test.tsx", "test"],
  ["pkg/foo.test.js", "test"],
  ["pkg/foo.spec.mjs", "test"],
  ["python/test_parser.py", "test"],
  ["python/parser_test.py", "test"],
  ["go/parser_test.go", "test"],
  ["vitest.config.ts", "config"],
  ["jest.config.js", "config"],
  ["pytest.ini", "config"],
  ["pyproject.toml", "config"],
  ["conftest.py", "config"],
  ["tsconfig.base.json", "config"],
  ["package.json", "config"],
  [".github/workflows/ci.yml", "config"],
  ["pnpm-lock.yaml", "lock"],
  ["package-lock.json", "lock"],
  ["README.md", "docs"],
  ["docs/ARCHITECTURE.md", "docs"],
  ["src/legacy/thing.ts", "source"],
];

describe("classifyFile", () => {
  it.each(table)("classifies %s as %s", (path, expected) => {
    expect(classifyFile(path)).toBe(expected);
  });

  it("treats a test directory as test code", () => {
    expect(isTestPath("test/retry.test.ts")).toBe(true);
    expect(isTestPath("src/testing/helper.ts")).toBe(false);
  });
});
