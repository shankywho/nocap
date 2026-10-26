import { join } from "node:path";
import type { ExecPort, FsPort } from "../ports.js";
import { parseJestJson, type ParsedRun } from "./parseJest.js";
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
}

const tail = (s: string, n = 2000) => (s.length > n ? s.slice(-n) : s);

export const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function empty(runner: string, exitCode: number, stderr: string, ms: number, error: string): TestRunResult {
  return {
    runner, total: 0, passed: 0, failed: 0, skipped: 0, durationMs: ms, tests: [], suiteErrors: [],
    exitCode, stderrTail: tail(stderr), environmentError: error,
  };
}

/** Always uses file reporters, never stdout JSON. */
export async function runTests(opts: RunTestsOptions): Promise<TestRunResult> {
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
