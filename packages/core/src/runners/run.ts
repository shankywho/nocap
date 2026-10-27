import { join } from "node:path";
import type { ExecPort, FsPort } from "../ports.js";
import { parseJestJson, type ParsedRun } from "./parseJest.js";
import { environmentSummary, failuresAreEnvironment } from "./classify.js";
import { tally } from "./tally.js";
import { junitReporterMissing, nodeTestArgs, parseNodeTestScript } from "./nodeTest.js";
import { parseJunit } from "./parseJunit.js";
import type { RunnerName, TestRunResult } from "./types.js";

export interface RunTestsOptions {
  exec: ExecPort;
  fs: FsPort;
  cwd: string;
  runner: RunnerName;
  files?: string[];
  /** Full-name regexes (already escaped) to narrow the run via the runner's title filter. */
  titles?: string[];
  timeoutMs: number;
  env: Record<string, string>;
  /** `--test-cmd` override with {files} and {out}; run through a shell. */
  customCommand?: string | null;
  customFormat?: "jest" | "junit" | null;
  /**
   * Treat a run whose failures are all module/package resolution or setup errors as an environment problem
   * (never a failing test). Default true. Bitecheck's reverted run turns it off: an import error there is the signal.
   */
  classifyEnvironment?: boolean;
}

const tail = (s: string, n = 2000) => (s.length > n ? s.slice(-n) : s);

export const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function empty(runner: string, exitCode: number, stderr: string, ms: number, error: string): TestRunResult {
  return {
    runner, total: 0, passed: 0, failed: 0, skipped: 0, durationMs: ms, tests: [], suiteErrors: [],
    exitCode, stderrTail: tail(stderr), environmentError: error,
  };
}

/** `node --test`: one process per file so each testcase can be attributed to its file (Node's junit output has none). */
async function runNodeTests(opts: RunTestsOptions, outDir: string, started: number): Promise<TestRunResult> {
  let script = null as ReturnType<typeof parseNodeTestScript>;
  try {
    const pkg = JSON.parse(await opts.fs.readFile(join(opts.cwd, "package.json"))) as { scripts?: { test?: string } };
    script = parseNodeTestScript(pkg.scripts?.test ?? "");
  } catch {
    // handled below
  }
  if (!script) return empty("node", 0, "", 0, "no `node --test` script found in package.json");
  const pattern = opts.titles && opts.titles.length > 0 ? opts.titles.join("|") : null;
  const groups = opts.files && opts.files.length > 0 ? opts.files.map((f) => [f]) : [[] as string[]];
  const tests: TestRunResult["tests"] = [];
  const suiteErrors: TestRunResult["suiteErrors"] = [];
  let exitCode = 0;
  let stderr = "";
  for (const [i, group] of groups.entries()) {
    const outFile = join(outDir, `node-${i}.xml`);
    const result = await opts.exec.run("node", nodeTestArgs(script, outFile, group, pattern), { cwd: opts.cwd, env: opts.env, timeoutMs: opts.timeoutMs });
    const ms = Date.now() - started;
    if (result.exitCode === 124) return empty("node", 124, result.stderr, ms, `timed out after ${opts.timeoutMs}ms`);
    if (result.exitCode === 127) return empty("node", 127, result.stderr, ms, "runner could not be started");
    if (junitReporterMissing(result.stderr)) return empty("node", result.exitCode, result.stderr, ms, `this Node (${process.version}) has no junit test reporter; use a newer Node or --test-cmd`);
    exitCode = exitCode || result.exitCode;
    stderr += result.stderr;
    const parsed = (await opts.fs.exists(outFile)) ? parseJunit(await opts.fs.readFile(outFile)) : null;
    const file = group[0] ?? "";
    if (parsed) tests.push(...parsed.tests.map((t) => ({ ...t, file })));
    else if (result.exitCode !== 0 && file) suiteErrors.push({ file, message: tail(result.stderr || result.stdout) });
  }
  if (tests.length === 0 && suiteErrors.length === 0) return empty("node", exitCode, stderr, Date.now() - started, "runner produced no parsable results");
  return { runner: "node", ...tally(tests, suiteErrors), tests, suiteErrors, durationMs: Date.now() - started, exitCode, stderrTail: tail(stderr), environmentError: null };
}

export async function runTests(opts: RunTestsOptions): Promise<TestRunResult> {
  const run = await runTestsRaw(opts);
  if (opts.classifyEnvironment === false || run.environmentError !== null || !failuresAreEnvironment(run)) return run;
  return { ...run, environmentError: `${run.failed} of ${run.total} failed to run because of a setup problem, not an assertion: ${environmentSummary(run)}` };
}

/** Always uses file reporters, never stdout JSON. */
async function runTestsRaw(opts: RunTestsOptions): Promise<TestRunResult> {
  const outDir = await opts.fs.mkdtemp("nocap-out-");
  const started = Date.now();
  try {
    const files = opts.files ?? [];
    const titleArgs = opts.titles && opts.titles.length > 0 ? [`${opts.titles.join("|")}`] : [];
    let cmd: { file: string; args: string[]; shell?: boolean };
    let outFile = join(outDir, "r.json");
    let format: "jest" | "junit" = "jest";

    if (opts.customCommand) {
      outFile = join(outDir, opts.customFormat === "junit" ? "r.xml" : "r.json");
      format = opts.customFormat ?? "jest";
      cmd = {
        file: opts.customCommand.replace("{files}", files.join(" ")).replace("{out}", outFile),
        args: [],
        shell: true,
      };
    } else if (opts.runner === "node") {
      return await runNodeTests(opts, outDir, started);
    } else if (opts.runner === "vitest") {
      cmd = {
        file: "npx",
        args: ["--no-install", "vitest", "run", ...files, "--reporter=json", `--outputFile=${outFile}`, ...(titleArgs[0] ? ["-t", titleArgs[0]] : [])],
      };
    } else if (opts.runner === "jest") {
      cmd = {
        file: "npx",
        args: ["--no-install", "jest", ...files, "--json", `--outputFile=${outFile}`, "--passWithNoTests=false", ...(titleArgs[0] ? ["-t", titleArgs[0]] : [])],
      };
    } else if (opts.runner === "pytest") {
      outFile = join(outDir, "r.xml");
      format = "junit";
      cmd = {
        file: "python",
        args: ["-m", "pytest", ...files, `--junit-xml=${outFile}`, "-q", ...(titleArgs[0] ? ["-k", opts.titles?.join(" or ") ?? ""] : [])],
      };
    } else {
      return empty(opts.runner, 0, "", 0, "no test runner detected");
    }

    const result = await opts.exec.run(cmd.file, cmd.args, {
      cwd: opts.cwd, env: opts.env, timeoutMs: opts.timeoutMs, ...(cmd.shell ? { shell: true } : {}),
    });
    const ms = Date.now() - started;
    if (result.exitCode === 124) return empty(opts.runner, 124, result.stderr, ms, `timed out after ${opts.timeoutMs}ms`);
    if (result.exitCode === 127) return empty(opts.runner, 127, result.stderr, ms, "runner could not be started");

    const text = (await opts.fs.exists(outFile)) ? await opts.fs.readFile(outFile) : "";
    const parsed: ParsedRun | null = text ? (format === "junit" ? parseJunit(text) : parseJestJson(text, [opts.cwd, await opts.fs.realpath(opts.cwd).catch(() => opts.cwd)])) : null;
    if (!parsed) return empty(opts.runner, result.exitCode, result.stderr || result.stdout, ms, "runner produced no parsable results");
    return { runner: opts.runner, ...parsed, durationMs: ms, exitCode: result.exitCode, stderrTail: tail(result.stderr), environmentError: null };
  } finally {
    await opts.fs.rm(outDir, { recursive: true, force: true });
  }
}
