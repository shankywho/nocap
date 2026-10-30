/** Shared by eval.ts and demo.ts: run `verify()` on a built fixture scenario with the real adapters. */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { ExecaExec, FixedClock, MemoryLogger, MockLlm, NodeFs, SimpleGitPort, SystemClock } from "@nocap/core/adapters";
import { createExecStage, type ChainStore, NocapEvents, verify, type Receipt, type RepairPacket } from "@nocap/core";

export const ROOT = fileURLToPath(new URL("../..", import.meta.url));
export const CACHE = join(ROOT, ".cache", "fixtures");

export interface ScenarioRun {
  receipt: Receipt;
  repair: RepairPacket | null;
  summary: string;
  repoPath: string;
}

export async function readSummary(name: string): Promise<string> {
  return readFile(join(ROOT, "fixtures", "scenarios", name, "summary.md"), "utf8");
}

export async function runScenario(
  name: string,
  opts: { exec: boolean; events?: NocapEvents; deterministic?: boolean; cacheDir?: string; summary?: string; chain?: { id: string; store: ChainStore } },
): Promise<ScenarioRun> {
  const repoPath = join(opts.cacheDir ?? CACHE, name);
  const summary = opts.summary ?? (await readSummary(name));
  const git = new SimpleGitPort(repoPath);
  const fs = new NodeFs();
  const exec = new ExecaExec();
  const runId = `${name}-${opts.exec ? "full" : "static"}`;
  const env = { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "", CI: "1" };
  const { receipt, repair } = await verify({
    runId,
    summary,
    config: {
      repoPath, exec: opts.exec, offline: true, actor: "eval-agent", model: null, role: null, agent: "eval-agent",
      testTimeoutMs: 120_000, scopeOverrides: {}, roleScopes: {}, userScope: {}, alan: null, testCommand: null, testFormat: null,
    },
    deps: { git, exec, fs, llm: new MockLlm(), clock: opts.deterministic ? new FixedClock() : new SystemClock(), logger: new MemoryLogger() },
    ...(opts.events ? { events: opts.events } : {}),
    ...(opts.chain ? { chain: opts.chain } : {}),
    ...(opts.exec ? { execStage: createExecStage({ git, exec, fs, runId, timeoutMs: 120_000, env, onBitecheck: (claimId, phase, detail) => opts.events?.emit({ type: "bitecheck", runId, claimId, phase, detail }) }) } : {}),
  });
  return { receipt, repair, summary, repoPath };
}
