/**
 * Composition root for local use: wires the real adapters to the engine.
 * Shared by the CLI, the Stop hook and the MCP server so none of them re-implement it.
 * This is the one place that reads `process.env`-style input, and it receives it as an argument.
 */
import { randomBytes } from "node:crypto";
import { appendFile, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { bitecheck } from "../bitecheck/run.js";
import { NO_INSTALL_ENV } from "../exec/safeEnv.js";
import { createExecStage } from "../exec/stage.js";
import { NocapEvents } from "../events.js";
import { mapScope } from "../extract/scopeMapper.js";
import { readChangeSet } from "../git/diff.js";
import { resolveRefs } from "../git/resolve.js";
import { FsChainStore } from "../loop/chain.js";
import { entriesFromReceipt, Ledger, trackedPaths } from "../ledger/ledger.js";
import { check as ledgerCheck, facts as ledgerFacts, renderFacts, type Answer } from "../ledger/query.js";
import { aggregate, type ScoreRow } from "../scorecard/aggregate.js";
import { verify, type VerifyOutput } from "../pipeline.js";
import type { LlmPort, VerifyConfig } from "../ports.js";
import { renderMarkdown } from "../render/markdown.js";
import { Receipt } from "../schema/receipt.js";
import type { Claim } from "../schema/claim.js";
import type { BitecheckResult } from "../schema/verdict.js";
import { ConsoleLogger, SystemClock } from "./clock.js";
import { ExecaExec } from "./exec.execa.js";
import { NodeFs } from "./fs.node.js";
import { SimpleGitPort } from "./git.simple.js";
import { readConfig, resolveLlmKey } from "./config.js";
import { MockLlm } from "./llm.mock.js";
import { OpenAiCompatLlm } from "./llm.openaiCompat.js";

export type Env = Record<string, string | undefined>;

/* ─── .nocaprc.json and flags ─────────────────────────────────────────── */

export interface Rc {
  scope: Record<string, string[]>;
  roleScopes: Record<string, string[]>;
  testCommand: string | null;
  testFormat: "jest" | "junit" | null;
}

const EMPTY_RC: Rc = { scope: {}, roleScopes: {}, testCommand: null, testFormat: null };

function globMap(value: unknown, field: string): Record<string, string[]> {
  if (value === undefined) return {};
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error(`${field} must be an object of string arrays`);
  const out: Record<string, string[]> = {};
  for (const [key, list] of Object.entries(value)) {
    if (!Array.isArray(list) || list.some((g) => typeof g !== "string")) throw new Error(`${field}.${key} must be an array of strings`);
    out[key.toLowerCase()] = list as string[];
  }
  return out;
}

export async function loadRc(repoPath: string): Promise<Rc> {
  let raw: string;
  try {
    raw = await readFile(join(repoPath, ".nocaprc.json"), "utf8");
  } catch {
    return EMPTY_RC;
  }
  try {
    const data = JSON.parse(raw) as Record<string, unknown>;
    const format = data.testFormat;
    if (format !== undefined && format !== null && format !== "jest" && format !== "junit") throw new Error("testFormat must be jest or junit");
    if (data.testCommand !== undefined && data.testCommand !== null && typeof data.testCommand !== "string") throw new Error("testCommand must be a string");
    return {
      scope: globMap(data.scope, "scope"),
      roleScopes: globMap(data.roleScopes, "roleScopes"),
      testCommand: (data.testCommand as string | null | undefined) ?? null,
      testFormat: (format as "jest" | "junit" | null | undefined) ?? null,
    };
  } catch (error) {
    throw new Error(`invalid .nocaprc.json: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/** `--scope auth=src/auth/**,lib/auth/**` (repeatable) -> { auth: [globs] } */
export function parseScopeFlags(values: string[]): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const value of values) {
    const at = value.indexOf("=");
    if (at <= 0) throw new Error(`--scope expects concept=glob,glob (got '${value}')`);
    out[value.slice(0, at).trim().toLowerCase()] = value.slice(at + 1).split(",").map((g) => g.trim()).filter(Boolean);
  }
  return out;
}

export function envFlag(value: string | undefined): boolean {
  return value === "1" || value === "true";
}

/* ─── receipts on disk ────────────────────────────────────────────────── */

/** Saves .nocap/receipts/<id>.{json,md}; hides .nocap via .git/info/exclude, never .gitignore. */
export async function saveReceipt(repoRoot: string, receipt: Receipt): Promise<string> {
  const dir = join(repoRoot, ".nocap", "receipts");
  await mkdir(dir, { recursive: true });
  const file = join(dir, `${receipt.id}.json`);
  await writeFile(file, `${JSON.stringify(receipt, null, 2)}\n`);
  await writeFile(join(dir, `${receipt.id}.md`), `${renderMarkdown(receipt)}\n`);
  await excludeNocap(repoRoot);
  return file;
}

async function excludeNocap(repoRoot: string): Promise<void> {
  try {
    const info = join(repoRoot, ".git", "info");
    await mkdir(info, { recursive: true });
    const path = join(info, "exclude");
    const current = await readFile(path, "utf8").catch(() => "");
    if (!current.split("\n").some((l) => l.trim() === ".nocap/")) {
      await appendFile(path, `${current.endsWith("\n") || current === "" ? "" : "\n"}.nocap/\n`);
    }
  } catch {
    // not a plain checkout (worktree or bare); skip silently
  }
}

export async function loadReceipt(file: string): Promise<Receipt> {
  return Receipt.parse(JSON.parse(await readFile(file, "utf8")));
}

export async function listReceiptFiles(repoRoot: string): Promise<string[]> {
  const dir = join(repoRoot, ".nocap", "receipts");
  const names = (await readdir(dir).catch(() => [] as string[])).filter((n) => n.endsWith(".json"));
  const withTimes = await Promise.all(
    names.map(async (n) => ({ file: join(dir, n), t: (JSON.parse(await readFile(join(dir, n), "utf8")) as { createdAt?: string }).createdAt ?? "" })),
  );
  return withTimes.sort((a, b) => a.t.localeCompare(b.t) || a.file.localeCompare(b.file)).map((x) => x.file);
}

export async function latestReceiptFile(repoRoot: string): Promise<string | null> {
  const files = await listReceiptFiles(repoRoot);
  return files[files.length - 1] ?? null;
}

export async function latestRepairReceiptFile(repoRoot: string): Promise<string | null> {
  const files = await listReceiptFiles(repoRoot);
  if (files.length === 0) return null;
  for (let i = files.length - 1; i >= 0; i--) {
    const file = files[i]!;
    try {
      const receipt = await loadReceipt(file);
      if (receipt.totals.contradicted > 0 || receipt.overall === "FAIL") {
        return file;
      }
    } catch {
      // ignore corrupt receipt file and continue
    }
  }
  return files[files.length - 1] ?? null;
}

/* ─── wiring ──────────────────────────────────────────────────────────── */

/** What extraction will use, so shells can say so instead of falling back silently. */
export function llmStatus(env: Env, offline: boolean): { mode: "llm" | "offline-flag" | "offline-nokey"; source: string | null } {
  if (offline || envFlag(env.MOCK_EXTERNALS) || envFlag(env.NOCAP_OFFLINE)) return { mode: "offline-flag", source: null };
  const found = resolveLlmKey(env);
  return found ? { mode: "llm", source: found.source } : { mode: "offline-nokey", source: null };
}

export function makeLlm(env: Env, offline: boolean): LlmPort {
  const key = resolveLlmKey(env)?.key ?? "";
  if (offline || envFlag(env.MOCK_EXTERNALS) || key.length === 0) return new MockLlm();
  const fallbackKey = env.LLM_FALLBACK_API_KEY ?? "";
  const stored = readConfig(env);
  return new OpenAiCompatLlm({
    primary: { baseUrl: env.LLM_BASE_URL ?? stored.llmBaseUrl ?? "https://api.groq.com/openai/v1", apiKey: key, model: env.LLM_MODEL ?? stored.llmModel ?? "openai/gpt-oss-120b" },
    fallback: fallbackKey
      ? { baseUrl: env.LLM_FALLBACK_BASE_URL ?? "https://openrouter.ai/api/v1", apiKey: fallbackKey, model: env.LLM_FALLBACK_MODEL ?? "openai/gpt-oss-120b" }
      : undefined,
    timeoutMs: Number(env.LLM_TIMEOUT_MS ?? 20_000),
    reasoningEffort: env.LLM_REASONING_EFFORT ?? "low",
  });
}

/** Only these variables reach test runners and build commands. */
export function childEnvFrom(env: Env): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of ["PATH", "HOME", "TMPDIR", "SHELL", "LANG", "NODE_PATH", "USERPROFILE", "SystemRoot"]) {
    const value = env[key];
    if (value !== undefined) out[key] = value;
  }
  out.CI = "1";
  return { ...out, ...NO_INSTALL_ENV };
}

export interface LocalVerifyOptions {
  repoPath: string;
  summary: string;
  base?: string | undefined;
  head?: string | undefined;
  agent?: string | undefined;
  actor?: string | undefined;
  model?: string | undefined;
  role?: string | undefined;
  exec?: boolean | undefined;
  offline?: boolean | undefined;
  scope?: string[] | undefined;
  testCommand?: string | undefined;
  testFormat?: "jest" | "junit" | undefined;
  chain?: string | undefined;
  /** Judge only the delta since the previous receipt in this repo (per-agent attribution). */
  sinceLast?: boolean | undefined;
  /** `role=glob,glob` declarations of other roles' scopes. */
  scopeRole?: string[] | undefined;
  events?: NocapEvents | undefined;
  llm?: LlmPort | undefined;
  save?: boolean | undefined;
  /** Allow builds and summary-requested commands in a worktree with its own dependency directories. Off by default; `NOCAP_ALLOW_BUILD=1` also enables it. */
  allowBuild?: boolean | undefined;
  /** Test seam: force linked dependency directories in the worktree. */
  modulesMode?: "auto" | "link" | undefined;
}

export interface LocalVerifyResult extends VerifyOutput {
  savedTo: string | null;
}

export async function verifyLocal(opts: LocalVerifyOptions, env: Env): Promise<LocalVerifyResult> {
  const repoPath = opts.repoPath;
  const rc = await loadRc(repoPath);
  const offline = opts.offline === true || envFlag(env.NOCAP_OFFLINE);
  const execEnabled = opts.exec !== false;
  const timeoutMs = Number(env.NOCAP_TEST_TIMEOUT_MS ?? 120_000);
  const agent = opts.agent ?? opts.actor ?? env.NOCAP_ACTOR ?? "unknown";
  const taskId = env.ALAN_TASK_ID ?? null;
  const config: VerifyConfig = {
    repoPath,
    exec: execEnabled,
    offline,
    actor: opts.actor ?? env.NOCAP_ACTOR ?? agent,
    model: opts.model ?? env.NOCAP_MODEL ?? null,
    role: opts.role ?? env.NOCAP_ROLE ?? null,
    agent,
    testTimeoutMs: timeoutMs,
    scopeOverrides: parseScopeFlags(opts.scope ?? []),
    roleScopes: { ...rc.roleScopes, ...parseScopeFlags(opts.scopeRole ?? []) },
    userScope: rc.scope,
    alan: taskId || env.ALAN_SESSION_ID ? { taskId, sessionId: env.ALAN_SESSION_ID ?? null } : null,
    testCommand: opts.testCommand ?? rc.testCommand,
    testFormat: opts.testFormat ?? rc.testFormat,
  };

  const runId = randomBytes(5).toString("hex");
  const git = new SimpleGitPort(repoPath);
  const fs = new NodeFs();
  const exec = new ExecaExec();
  const events = opts.events ?? new NocapEvents();
  const stage = execEnabled
    ? createExecStage({
        git, exec, fs, runId, timeoutMs, env: childEnvFrom(env),
        testCommand: config.testCommand, testFormat: config.testFormat,
        onBitecheck: (claimId, phase, detail) => events.emit({ type: "bitecheck", runId, claimId, phase, detail }),
        onWarning: (message) => process.stderr.write(`nocap: WARNING: ${message}\n`),
        allowBuild: opts.allowBuild === true || envFlag(env.NOCAP_ALLOW_BUILD),
        ...(opts.modulesMode ? { modulesMode: opts.modulesMode } : {}),
      })
    : undefined;

  let base = opts.base;
  if (!base && opts.sinceLast) {
    const previous = await latestReceiptFile(repoPath).then((f) => (f ? loadReceipt(f) : null)).catch(() => null);
    if (previous) base = previous.input.head;
  }

  const output = await verify({
    config, summary: opts.summary, runId, events,
    ...(base ? { base } : {}),
    ...(opts.head ? { head: opts.head } : {}),
    deps: { git, exec, fs, llm: opts.llm ?? makeLlm(env, offline), clock: new SystemClock(), logger: new ConsoleLogger("warn") },
    ...(stage ? { execStage: stage } : {}),
    ...(opts.chain ? { chain: { id: opts.chain, store: new FsChainStore(fs, `${repoPath}/.nocap/chains`) } } : {}),
  });
  const savedTo = opts.save === false ? null : await saveReceipt(repoPath, output.receipt).catch(() => null);
  if (opts.save !== false) await recordInLedger(repoPath, output.receipt, git, fs).catch(() => undefined);
  return { ...output, savedTo };
}

/* ─── mid-task helpers (MCP `bitecheck`, `check_scope`) ───────────────── */

export async function bitecheckLocal(
  opts: { repoPath: string; testFiles: string[]; base?: string | undefined; keywords?: string[]; allowBuild?: boolean | undefined },
  env: Env,
): Promise<BitecheckResult> {
  const git = new SimpleGitPort(opts.repoPath);
  const fs = new NodeFs();
  const runId = randomBytes(5).toString("hex");
  const refs = await resolveRefs({ git, fs, clock: new SystemClock(), repoPath: opts.repoPath, runId, base: opts.base });
  const changeSet = await readChangeSet({ git, repoPath: refs.repoRoot, baseSha: refs.baseSha, headSha: refs.headSha });
  const words = opts.keywords ?? opts.testFiles.flatMap((f) => (f.split("/").pop() ?? f).replace(/\.(test|spec)\.\w+$/, "").split(/[^a-z0-9]+/i)).filter((w) => w.length > 2).map((w) => w.toLowerCase());
  const claim: Claim = {
    id: "c1", quote: `tests in ${opts.testFiles.join(", ")}`, type: "tests_added", subject: null,
    keywords: words.slice(0, 8), paths: opts.testFiles, symbols: [], count: null, command: null, span: null,
  };
  const rc = await loadRc(opts.repoPath);
  return bitecheck({
    claim, changeSet, git, exec: new ExecaExec(), fs, repoRoot: refs.repoRoot, baseSha: refs.baseSha, headSha: refs.headSha,
    runId, timeoutMs: Number(env.NOCAP_TEST_TIMEOUT_MS ?? 120_000), env: childEnvFrom(env), allowBuild: opts.allowBuild === true || envFlag(env.NOCAP_ALLOW_BUILD),
    testCommand: rc.testCommand, testFormat: rc.testFormat,
  });
}

export async function checkScopeLocal(
  opts: { repoPath: string; concept: string; base?: string | undefined },
  env: Env,
): Promise<{ concept: string; globs: string[]; mappedFiles: string[]; touched: { path: string; status: string; additions: number; deletions: number }[] }> {
  const git = new SimpleGitPort(opts.repoPath);
  const fs = new NodeFs();
  const refs = await resolveRefs({ git, fs, clock: new SystemClock(), repoPath: opts.repoPath, runId: randomBytes(5).toString("hex"), base: opts.base });
  const changeSet = await readChangeSet({ git, repoPath: refs.repoRoot, baseSha: refs.baseSha, headSha: refs.headSha });
  const tree = await git.raw(["ls-tree", "-r", "--name-only", "-z", refs.headSha], { cwd: refs.repoRoot });
  const files = tree.stdout.split("\0").filter(Boolean);
  const rc = await loadRc(opts.repoPath);
  const mapping = await mapScope({ concept: opts.concept, files, overrides: rc.scope, llm: envFlag(env.NOCAP_OFFLINE) ? null : makeLlm(env, false) });
  const mapped = new Set(mapping.matchedFiles);
  const touched = changeSet.files.filter((f) => mapped.has(f.path) || (f.previousPath !== null && mapped.has(f.previousPath)));
  return {
    concept: mapping.concept, globs: mapping.globs, mappedFiles: mapping.matchedFiles,
    touched: touched.map((f) => ({ path: f.path, status: f.status, additions: f.additions, deletions: f.deletions })),
  };
}

/* ─── ledger, handoff, scorecard ──────────────────────────────────────── */

const ledgerFile = (repoPath: string) => `${repoPath}/.nocap/ledger.jsonl`;

async function recordInLedger(repoPath: string, receipt: Receipt, git: SimpleGitPort, fs: NodeFs): Promise<void> {
  const parent = await git.raw(["rev-parse", `${receipt.input.head}^`], { cwd: repoPath });
  const anchorSha = receipt.input.headIsSnapshot && parent.exitCode === 0 ? parent.stdout.trim() : receipt.input.head;
  const blobMap = new Map<string, string | null>();
  const paths = [...new Set(receipt.claims.flatMap((_, i) => trackedPaths(receipt, i)))];
  for (const p of paths) {
    const r = await git.raw(["rev-parse", `${receipt.input.head}:${p}`], { cwd: repoPath });
    blobMap.set(p, r.exitCode === 0 ? r.stdout.trim() : null);
  }
  const entries = entriesFromReceipt(receipt, anchorSha, (ps) => Object.fromEntries(ps.map((p) => [p, blobMap.get(p) ?? null])));
  await new Ledger(fs, ledgerFile(repoPath)).append(entries);
}

export async function ledgerFactsLocal(opts: { repoPath: string; query?: string | undefined }): Promise<{ markdown: string; trusted: number; warnings: number; stale: number }> {
  const f = await ledgerFacts(new Ledger(new NodeFs(), ledgerFile(opts.repoPath)), new SimpleGitPort(opts.repoPath), opts.repoPath, opts.query);
  return { markdown: renderFacts(f), trusted: f.trusted.length, warnings: f.warnings.length, stale: f.stale.length };
}

export async function ledgerCheckLocal(opts: { repoPath: string; statement: string }): Promise<Answer[]> {
  return ledgerCheck(new Ledger(new NodeFs(), ledgerFile(opts.repoPath)), new SimpleGitPort(opts.repoPath), opts.repoPath, opts.statement);
}

export async function scorecardLocal(repoPath: string): Promise<ScoreRow[]> {
  return aggregate(await Promise.all((await listReceiptFiles(repoPath)).map(loadReceipt)));
}
