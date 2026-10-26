export interface TestCase {
  file: string;
  title: string;
  status: string;
}

export interface TestRunResult {
  runner: string;
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  durationMs: number;
  tests: TestCase[];
  /** True when the runner could not execute (missing binary, timeout, crash). */
  environmentError: string | null;
}
