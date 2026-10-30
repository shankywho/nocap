import { z } from "zod";
import { tally } from "./tally.js";
import type { SuiteError, TestCase } from "./types.js";

const Assertion = z.object({
  ancestorTitles: z.array(z.string()).optional(),
  title: z.string(),
  fullName: z.string().optional(),
  status: z.string(),
  failureMessages: z.array(z.string()).optional(),
});
const FileResult = z.object({
  name: z.string(),
  status: z.string().optional(),
  message: z.string().optional(),
  assertionResults: z.array(Assertion).default([]),
});
const JestJson = z.object({
  numTotalTests: z.number().optional(),
  numPassedTests: z.number().optional(),
  numFailedTests: z.number().optional(),
  numPendingTests: z.number().optional(),
  testResults: z.array(FileResult),
});

export interface ParsedRun {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  tests: TestCase[];
  suiteErrors: SuiteError[];
}

function relative(file: string, roots: string[]): string {
  const normal = file.replace(/\\/g, "/");
  for (const root of roots) {
    const prefix = root.replace(/\\/g, "/").replace(/\/$/, "") + "/";
    if (normal.startsWith(prefix)) return normal.slice(prefix.length);
  }
  return normal;
}

/** Parses Jest-compatible JSON (Jest and Vitest `--reporter=json`). Returns null if unparsable. */
export function parseJestJson(text: string, roots: string | string[]): ParsedRun | null {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  const parsed = JestJson.safeParse(raw);
  if (!parsed.success) return null;

  const tests: TestCase[] = [];
  const suiteErrors: SuiteError[] = [];
  for (const file of parsed.data.testResults) {
    const path = relative(file.name, Array.isArray(roots) ? roots : [roots]);
    for (const a of file.assertionResults) {
      const status = a.status === "pending" || a.status === "todo" ? "skipped" : a.status;
      const message = a.failureMessages?.join("\n");
      tests.push({
        file: path,
        title: a.title,
        fullName: a.fullName ?? [...(a.ancestorTitles ?? []), a.title].join(" "),
        status,
        ...(message ? { message } : {}),
      });
    }
    if (file.assertionResults.length === 0 && file.status === "failed") {
      suiteErrors.push({ file: path, message: file.message ?? "suite failed to run" });
    }
  }
  return { ...tally(tests, suiteErrors), tests, suiteErrors };
}
