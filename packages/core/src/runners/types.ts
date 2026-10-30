export interface TestCase {
  file: string;
  title: string;
  fullName: string;
  status: string;
  message?: string;
}

export interface SuiteError {
  file: string;
  message: string;
}

export interface TestRunResult {
  runner: string;
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  durationMs: number;
  tests: TestCase[];
  /** File-level failures that produced no test cases (import errors, syntax errors). */
  suiteErrors: SuiteError[];
  exitCode: number;
  stderrTail: string;
  /** Set when the runner could not execute or produced nothing parsable (missing binary, timeout, crash). */
  environmentError: string | null;
}

export type RunnerName = "vitest" | "jest" | "pytest" | "node" | "custom";
