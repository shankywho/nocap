import type { TestRunResult } from "./types.js";

/** Messages that mean "the project could not be set up here", not "the code is wrong". */
const ENVIRONMENT = [
  /Cannot find module/i,
  /Cannot find package/i,
  /Failed to resolve (?:import|entry)/i,
  /Failed to load url/i,
  /ERR_MODULE_NOT_FOUND/,
  /ERR_PACKAGE_PATH_NOT_EXPORTED/,
  /ERR_UNSUPPORTED_DIR_IMPORT/,
  /Could not resolve/i,
  /ModuleNotFoundError/,
  /No module named/i,
  /Unable to resolve module/i,
  /workspace package .* (?:not found|missing)/i,
  /missing (?:workspace package|dist|build output)/i,
  /\bdist\b.*(?:no such file|not found|does not exist)/i,
  /ENOENT.*\bdist\b/i,
  /command not found|not recognized as an internal or external command/i,
];

export const isEnvironmentMessage = (message: string): boolean => ENVIRONMENT.some((re) => re.test(message));

/**
 * True when the run failed and every failure is a module/package resolution or setup error.
 * Mixed runs (some real assertion failures) are not environment problems.
 */
export function failuresAreEnvironment(run: Pick<TestRunResult, "tests" | "suiteErrors" | "failed">): boolean {
  if (run.failed === 0) return false;
  const failedTests = run.tests.filter((t) => t.status === "failed");
  if (failedTests.length === 0 && run.suiteErrors.length === 0) return false;
  return failedTests.every((t) => isEnvironmentMessage(t.message ?? "")) && run.suiteErrors.every((e) => isEnvironmentMessage(e.message));
}

/** First line of the first environment failure, for the reason shown to the user. */
export function environmentSummary(run: Pick<TestRunResult, "tests" | "suiteErrors">): string {
  const first = run.suiteErrors[0]?.message ?? run.tests.find((t) => t.status === "failed")?.message ?? "setup error";
  const line = first.split("\n").find((l) => l.trim().length > 0) ?? first;
  return line.trim().slice(0, 160);
}

/** A worktree run that collected under half of what the in-place run did was missing files, not failing tests. */
export const collectedTooFew = (collected: number, inPlace: number): boolean => inPlace > 0 && collected < inPlace * 0.5;
