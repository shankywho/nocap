import picomatch from "picomatch";

export type FileClass = "test" | "config" | "lock" | "docs" | "source";

const TEST_GLOBS = [
  "**/*.{test,spec}.{ts,tsx,js,jsx,mjs,cjs}",
  "**/__tests__/**",
  "**/test/**",
  "**/tests/**",
  "**/test_*.py",
  "**/*_test.py",
  "**/*_test.go",
];

const CONFIG_GLOBS = [
  "**/{jest,vitest}.config.*",
  "**/pytest.ini",
  "**/pyproject.toml",
  "**/conftest.py",
  "**/tsconfig*.json",
  "**/package.json",
  "**/.github/workflows/**",
];

const LOCK_FILES = new Set([
  "pnpm-lock.yaml",
  "package-lock.json",
  "yarn.lock",
  "poetry.lock",
  "uv.lock",
]);

const isTest = picomatch(TEST_GLOBS);
const isConfig = picomatch(CONFIG_GLOBS);

export function isTestPath(path: string): boolean {
  return isTest(path);
}

export function isConfigPath(path: string): boolean {
  return isConfig(path);
}

export function isLockPath(path: string): boolean {
  const name = path.split("/").pop() ?? path;
  return LOCK_FILES.has(name);
}

export function isDocsPath(path: string): boolean {
  return path.endsWith(".md") || path.startsWith("docs/") || path.includes("/docs/");
}

export function isSourcePath(path: string): boolean {
  return classifyFile(path) === "source";
}

export function classifyFile(path: string): FileClass {
  if (isTestPath(path)) return "test";
  if (isConfigPath(path)) return "config";
  if (isLockPath(path)) return "lock";
  if (isDocsPath(path)) return "docs";
  return "source";
}

/** Test globs as globs, for scope mapping of the hardcoded "tests" concept. */
export const TEST_GLOBS_LIST = TEST_GLOBS;
export const CONFIG_GLOBS_LIST = CONFIG_GLOBS;
export const LOCK_FILES_LIST = [...LOCK_FILES];
export const DOCS_GLOBS_LIST = ["**/*.md", "docs/**"];
