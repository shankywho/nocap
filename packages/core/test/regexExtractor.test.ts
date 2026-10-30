import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { extractClaims, extractPaths, extractSymbols } from "../src/extract/regexExtractor";

const root = fileURLToPath(new URL("../../..", import.meta.url));

function summaryOf(name: string): string {
  return readFileSync(`${root}/fixtures/scenarios/${name}/summary.md`, "utf8");
}

describe("regexExtractor patterns", () => {
  const cases: [string, string][] = [
    ["Didn't touch auth.", "scope_none"],
    ["No changes to the parser.", "scope_none"],
    ["Only changed src/parser.ts.", "scope_only"],
    ["Added tests for the retry backoff.", "tests_added"],
    ["Wrote a failing test for the parser bug.", "tests_added"],
    ["All 13 tests pass.", "tests_pass"],
    ["Tests are green.", "tests_pass"],
    ["The build passes.", "build_pass"],
    ["tsc is clean.", "build_pass"],
    ["Created src/backoff.ts.", "file_created"],
    ["Updated src/retry.ts.", "file_modified"],
    ["Deleted test/legacy.test.ts.", "file_deleted"],
    ["Added the dependency zod.", "dependency_added"],
    ["Fixed the race in parsePrice.", "bug_fixed"],
    ["Pure refactor with no behaviour change.", "refactor_no_behavior_change"],
    ["Changed 3 files.", "count_files_changed"],
  ];

  it.each(cases)("extracts %s as %s", (summary, type) => {
    const claims = extractClaims(summary);
    expect(claims[0]?.type).toBe(type);
  });

  it("splits a bullet summary into one claim per line", () => {
    const claims = extractClaims(
      ["- Added tests for the retry backoff.", "- Didn't touch auth.", "- All 12 tests pass."].join(
        "\n",
      ),
    );
    expect(claims.map((claim) => claim.type)).toEqual(["tests_added", "scope_none", "tests_pass"]);
  });

  it("splits one sentence with two statements into two claims", () => {
    const claims = extractClaims("Wrote a test for the parser, then fixed parsePrice.");
    expect(claims.map((claim) => claim.type)).toEqual(["tests_added", "bug_fixed"]);
  });

  it("ignores pleasantries", () => {
    expect(extractClaims("Done.")).toEqual([]);
  });

  it("captures a count for tests pass and file counts", () => {
    expect(extractClaims("All 13 tests pass.")[0]?.count).toBe(13);
    expect(extractClaims("Changed 5 files.")[0]?.count).toBe(5);
  });

  it("infers the build command", () => {
    expect(extractClaims("lint is clean.")[0]?.command).toBe("npm run lint");
    expect(extractClaims("typecheck passes.")[0]?.command).toBe("npx tsc --noEmit");
  });

  it("extracts paths and backticked symbols", () => {
    const sentence = "Added exponential backoff to `withRetry` in src/retry.ts.";
    expect(extractPaths(sentence)).toEqual(["src/retry.ts"]);
    expect(extractSymbols(sentence)).toEqual(["withRetry"]);
  });
});

describe("regexExtractor on the fixture summaries", () => {
  const expected: Record<string, string[]> = {
    honest: ["file_modified", "tests_added", "scope_none", "tests_pass"],
    toothless: ["file_modified", "tests_added", "scope_none", "tests_pass"],
    tampered: ["bug_fixed", "tests_pass"],
    scope_violation: ["file_modified", "tests_added", "scope_none", "tests_pass"],
    denominator: ["file_modified", "tests_added", "scope_none", "tests_pass"],
    untracked: ["file_created", "symbol_added", "tests_added"],
    tdd_trap: ["tests_added", "bug_fixed", "tests_pass"],
    fake_refactor: ["refactor_no_behavior_change", "scope_none"],
  };

  it.each(Object.entries(expected))("extracts the expected types for %s", (name, types) => {
    const claims = extractClaims(summaryOf(name));
    expect(claims.map((claim) => claim.type)).toEqual(types);
  });

  it("gives the auth claim the auth keyword family", () => {
    const scope = extractClaims(summaryOf("honest")).find((claim) => claim.type === "scope_none");
    expect(scope?.subject).toBe("auth");
    expect(scope?.keywords).toEqual(
      expect.arrayContaining(["auth", "login", "session", "token", "jwt"]),
    );
  });

  it("keeps the retry paths on the honest claims", () => {
    const claims = extractClaims(summaryOf("honest"));
    expect(claims[0]?.paths).toEqual(["src/retry.ts"]);
    expect(claims[0]?.symbols).toEqual(["withRetry"]);
    expect(claims[1]?.paths).toEqual(["test/retry.test.ts"]);
    expect(claims[3]?.count).toBe(13);
  });
});

describe("symbol_added rule", () => {
  it("extracts a backticked symbol with its path", () => {
    const [claim] = extractClaims("Added `computeDelay()` in src/backoff.ts and exported it.", []);
    expect(claim).toMatchObject({ type: "symbol_added", symbols: ["computeDelay"], paths: ["src/backoff.ts"] });
  });
  it("does not steal a file_created sentence", () => {
    expect(extractClaims("Created `src/backoff.ts` with `computeDelay()`.", []).map((c) => c.type)).toEqual(["file_created", "symbol_added"]);
  });
});

describe("symbol + file sentences", () => {
  it("'Added `x()` in <path>' yields symbol_added and file_modified", () => {
    const claims = extractClaims("Added `computeDelay()` in src/backoff.ts.");
    expect(claims.map((c) => c.type).sort()).toEqual(["file_modified", "symbol_added"]);
    const sym = claims.find((c) => c.type === "symbol_added");
    const file = claims.find((c) => c.type === "file_modified");
    expect(sym?.symbols).toContain("computeDelay");
    expect(file?.paths).toEqual(["src/backoff.ts"]);
  });

  it("'Implemented `x()` to <path>' does the same", () => {
    const claims = extractClaims("Implemented `mul()` to src/math.ts");
    expect(claims.map((c) => c.type).sort()).toEqual(["file_modified", "symbol_added"]);
  });

  it("a symbol sentence without a path stays a single claim", () => {
    expect(extractClaims("Added `computeDelay()`.").map((c) => c.type)).toEqual(["symbol_added"]);
  });
});
