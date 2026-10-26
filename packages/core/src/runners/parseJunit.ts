import type { ParsedRun } from "./parseJest.js";
import type { SuiteError, TestCase } from "./types.js";

const decode = (s: string) =>
  s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");

function attrs(tag: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of tag.matchAll(/([\w:-]+)="([^"]*)"/g)) {
    if (m[1] !== undefined && m[2] !== undefined) out[m[1]] = decode(m[2]);
  }
  return out;
}

/** Minimal JUnit XML reader (pytest `--junit-xml`). Returns null if no testcase elements are found. */
export function parseJunit(xml: string): ParsedRun | null {
  const tests: TestCase[] = [];
  const suiteErrors: SuiteError[] = [];
  const re = /<testcase\b([^>]*?)(\/>|>([\s\S]*?)<\/testcase>)/g;
  for (const m of xml.matchAll(re)) {
    const a = attrs(m[1] ?? "");
    const body = m[3] ?? "";
    const file = (a.file ?? (a.classname ?? "").replace(/\./g, "/") + ".py").replace(/^\.\//, "");
    const failure = /<(failure|error)\b[^>]*?(?:message="([^"]*)")?[^>]*>/.exec(body);
    const status = failure ? "failed" : /<skipped\b/.test(body) ? "skipped" : "passed";
    const title = a.name ?? "";
    tests.push({
      file,
      title,
      fullName: title,
      status,
      ...(failure ? { message: decode(failure[2] ?? "failed") } : {}),
    });
  }
  if (tests.length === 0) return null;
  const count = (s: string) => tests.filter((t) => t.status === s).length;
  return { total: tests.length, passed: count("passed"), failed: count("failed"), skipped: count("skipped"), tests, suiteErrors };
}
