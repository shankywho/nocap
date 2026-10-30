import type { SuiteError, TestCase } from "./types.js";

export interface Tally {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
}

/**
 * The one place totals are computed. A file that failed to load counts as one failed test, so
 * `passed + failed + skipped === total` always holds and every report quotes the same numbers.
 */
export function tally(tests: TestCase[], suiteErrors: SuiteError[]): Tally {
  const count = (s: string) => tests.filter((t) => t.status === s).length;
  return {
    total: tests.length + suiteErrors.length,
    passed: count("passed"),
    failed: count("failed") + suiteErrors.length,
    skipped: count("skipped"),
  };
}
