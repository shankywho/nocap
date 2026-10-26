import { randomBytes } from "node:crypto";
import { writeFile } from "node:fs/promises";
import {
  createExecStage,
  NocapEvents,
  renderJson,
  renderMarkdown,
  renderTerminal,
  repairMarkdown,
  verify,
  FsChainStore,
  type LlmPort,
  type RepairPacket,
  type Receipt,
  type VerifyConfig,
} from "@nocap/core";
import { ConsoleLogger, ExecaExec, MockLlm, NodeFs, OpenAiCompatLlm, SimpleGitPort, SystemClock } from "@nocap/core/adapters";
import { envFlag, loadRc, parseScopeFlags } from "../io/config.js";
import { publishReceipt } from "../io/publish.js";
import { createPrinter } from "../io/printer.js";
import { readSummary, UsageError } from "../io/readSummary.js";
import { saveReceipt } from "../io/store.js";

export interface CheckOptions {
  summary?: string;
  base?: string;
  head?: string;
  agent?: string;
  exec?: boolean; // commander sets false for --no-exec
  offline?: boolean;
  scope?: string[];
  testCmd?: string;
  testFormat?: "jest" | "junit";
  json?: boolean;
  md?: boolean;
  out?: string;
  publish?: boolean;
  hunks?: boolean; // false for --no-hunks
  strict?: boolean;
  repair?: boolean;
  actor?: string;
  model?: string;
  role?: string;
  verbose?: boolean;
  chain?: string;
  cwd?: string;
  /** Test seam: inject summary text instead of reading stdin/file. */
  summaryText?: string;
  llm?: LlmPort;
}

export interface CheckResult {
  exitCode: number;
  receipt: Receipt | null;
  repair: RepairPacket | null;
}

function makeLlm(env: NodeJS.ProcessEnv, offline: boolean): LlmPort {
  const key = env.LLM_API_KEY ?? "";
  if (offline || envFlag(env.MOCK_EXTERNALS) || key.length === 0) return new MockLlm();
  const fallbackKey = env.LLM_FALLBACK_API_KEY ?? "";
  return new OpenAiCompatLlm({
    primary: { baseUrl: env.LLM_BASE_URL ?? "https://api.groq.com/openai/v1", apiKey: key, model: env.LLM_MODEL ?? "openai/gpt-oss-120b" },
    fallback: fallbackKey
      ? { baseUrl: env.LLM_FALLBACK_BASE_URL ?? "https://openrouter.ai/api/v1", apiKey: fallbackKey, model: env.LLM_FALLBACK_MODEL ?? "openai/gpt-oss-120b" }
      : undefined,
    timeoutMs: Number(env.LLM_TIMEOUT_MS ?? 20_000),
    reasoningEffort: env.LLM_REASONING_EFFORT ?? "low",
  });
}

export async function runCheck(opts: CheckOptions, env: NodeJS.ProcessEnv = process.env): Promise<CheckResult> {
  const err = (message: string) => process.stderr.write(`nocap: ${message}\n`);
  try {
    const repoPath = opts.cwd ?? process.cwd();
    const summary = opts.summaryText ?? (await readSummary(opts.summary));
    const rc = await loadRc(repoPath);
    const offline = opts.offline === true || envFlag(env.NOCAP_OFFLINE);
    const execEnabled = opts.exec !== false;
    const timeoutMs = Number(env.NOCAP_TEST_TIMEOUT_MS ?? 120_000);
    const agent = opts.agent ?? opts.actor ?? "agent";
    const taskId = env.ALAN_TASK_ID ?? null;
    const config: VerifyConfig = {
      repoPath,
      exec: execEnabled,
      offline,
      actor: opts.actor ?? agent,
      model: opts.model ?? null,
      role: opts.role ?? null,
      agent,
      testTimeoutMs: timeoutMs,
      scopeOverrides: parseScopeFlags(opts.scope ?? []),
      roleScopes: rc.roleScopes,
      userScope: rc.scope,
      alan: taskId || env.ALAN_SESSION_ID ? { taskId, sessionId: env.ALAN_SESSION_ID ?? null } : null,
      testCommand: opts.testCmd ?? rc.testCommand,
      testFormat: opts.testFormat ?? rc.testFormat,
    };

    const runId = randomBytes(5).toString("hex");
    const git = new SimpleGitPort(repoPath);
    const fs = new NodeFs();
    const exec = new ExecaExec();
    const events = new NocapEvents();
    const printer = createPrinter({ verbose: opts.verbose === true, quiet: opts.json === true && !opts.verbose });
    events.on((e) => printer.onEvent(e));

    const childEnv: Record<string, string> = {};
    for (const key of ["PATH", "HOME", "TMPDIR", "SHELL", "LANG", "NODE_PATH", "USERPROFILE", "SystemRoot"]) {
      const value = env[key];
      if (value !== undefined) childEnv[key] = value;
    }
    childEnv.CI = "1";

    const stage = execEnabled
      ? createExecStage({
          git, exec, fs, runId, timeoutMs, env: childEnv,
          testCommand: config.testCommand, testFormat: config.testFormat,
          onBitecheck: (claimId, phase, detail) => events.emit({ type: "bitecheck", runId, claimId, phase, detail }),
        })
      : undefined;

    let output;
    try {
      output = await verify({
        config, summary, runId, events,
        ...(opts.base ? { base: opts.base } : {}),
        ...(opts.head ? { head: opts.head } : {}),
        deps: { git, exec, fs, llm: opts.llm ?? makeLlm(env, offline), clock: new SystemClock(), logger: new ConsoleLogger("warn") },
        ...(stage ? { execStage: stage } : {}),
        ...(opts.chain ? { chain: { id: opts.chain, store: new FsChainStore(fs, `${repoPath}/.nocap/chains`) } } : {}),
      });
    } finally {
      printer.stop();
    }
    const { receipt, repair } = output;

    const color = process.stdout.isTTY === true && env.NO_COLOR === undefined;
    const text = opts.json ? renderJson(receipt) : opts.md ? renderMarkdown(receipt) : renderTerminal(receipt, { color });
    if (opts.out) await writeFile(opts.out, `${text}\n`);
    process.stdout.write(`${text}\n`);

    const savedTo = await saveReceipt(repoPath, receipt).catch(() => null);
    if (savedTo && !opts.json) process.stderr.write(`saved ${savedTo}\n`);

    if (opts.repair && repair && !opts.json) {
      process.stdout.write(`\n${repairMarkdown(repair)}\n`);
    }
    if (opts.publish) {
      const apiUrl = env.NOCAP_API_URL ?? "https://nocap.vercel.app";
      try {
        const published = await publishReceipt(receipt, { apiUrl, noHunks: opts.hunks === false });
        process.stderr.write(`published ${published.url}\n`);
      } catch (error) {
        err(error instanceof Error ? error.message : String(error));
      }
    }

    const exitCode = receipt.overall === "FAIL" ? 1 : receipt.overall === "MIXED" && opts.strict ? 3 : 0;
    return { exitCode, receipt, repair };
  } catch (error) {
    err(error instanceof Error ? error.message : String(error));
    if (error instanceof UsageError) err("run `nocap check --help` for usage.");
    return { exitCode: 2, receipt: null, repair: null };
  }
}
