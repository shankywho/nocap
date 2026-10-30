import { extractWithLlm } from "./extract/llmExtractor.js";
import { mapScope } from "./extract/scopeMapper.js";
import type { Mapping } from "./extract/keywordScope.js";
import { readChangeSet } from "./git/diff.js";
import { resolveRefs } from "./git/resolve.js";
import { NocapEvents } from "./events.js";
import { buildRepairPacket, repairText, type RepairPacket } from "./policy/repair.js";
import { overallPolicy, totals } from "./policy/overall.js";
import type { VerifyConfig, VerifyDeps } from "./ports.js";
import type { Claim } from "./schema/claim.js";
import type { Receipt, TraceStep } from "./schema/receipt.js";
import type { BitecheckResult, Flag, Verdict } from "./schema/verdict.js";
import type { TestRunResult } from "./runners/types.js";
import { countIntegrity } from "./tamper/countIntegrity.js";
import { tamperFlags } from "./tamper/rules.js";
import { claimConcept, type VerifyContext } from "./verifiers/helpers.js";
import { undisclosedChanges, verifyClaim } from "./verifiers/index.js";
import { NOCAP_VERSION } from "./version.js";

/** Execution-backed stage (suite run, Bitecheck, build commands). Supplied by P5; absent under --no-exec. */
export interface ExecStage {
  runSuite(ctx: { repoRoot: string; headSha: string }): Promise<TestRunResult | null>;
  bitecheck(claim: Claim, ctx: { repoRoot: string; baseSha: string; headSha: string; changedFiles: string[] }): Promise<BitecheckResult | null>;
  runCommand(command: string, ctx: { repoRoot: string; headSha: string }): Promise<{ exitCode: number; durationMs: number; stderrTail: string; command: string } | null>;
}

export interface VerifyInput {
  config: VerifyConfig;
  deps: VerifyDeps;
  summary: string;
  runId: string;
  base?: string;
  head?: string;
  events?: NocapEvents;
  execStage?: ExecStage;
}

export interface VerifyOutput {
  receipt: Receipt;
  repair: RepairPacket | null;
}

const SCOPE_TYPES = new Set(["scope_none", "scope_only"]);

export async function verify(input: VerifyInput): Promise<VerifyOutput> {
  const { config, deps, summary, runId } = input;
  const { git, clock } = deps;
  const events = input.events ?? new NocapEvents();
  const started = clock.now();
  const trace: TraceStep[] = [];

  async function step<T>(name: string, fn: () => Promise<T>, detail: (v: T) => string = () => ""): Promise<T> {
    const t0 = clock.now();
    events.emit({ type: "step.start", runId, step: name, at: t0 });
    try {
      const value = await fn();
      const ms = clock.now() - t0;
      const text = detail(value).slice(0, 300);
      trace.push({ step: name, ms, status: "ok", detail: text });
      events.emit({ type: "step.end", runId, step: name, ms, status: "ok", detail: text });
      return value;
    } catch (error) {
      const ms = clock.now() - t0;
      const text = (error instanceof Error ? error.message : String(error)).slice(0, 300);
      trace.push({ step: name, ms, status: "error", detail: text });
      events.emit({ type: "step.end", runId, step: name, ms, status: "error", detail: text });
      throw error;
    }
  }

  const refs = await step(
    "resolve",
    () => resolveRefs({ git, fs: deps.fs, clock, repoPath: config.repoPath, runId, base: input.base, head: input.head }),
    (r) => `${r.baseSha.slice(0, 7)}..${r.headSha.slice(0, 7)}${r.headIsSnapshot ? " (snapshot)" : ""}`,
  );
  const changeSet = await step(
    "diff",
    () => readChangeSet({ git, repoPath: refs.repoRoot, baseSha: refs.baseSha, headSha: refs.headSha }),
    (c) => `${c.files.length} files`,
  );
  const tree = await git.raw(["ls-tree", "-r", "--name-only", "-z", refs.headSha], { cwd: refs.repoRoot });
  const filesAtHead = tree.stdout.split("\0").filter((p) => p.length > 0);
  const show = async (sha: string, path: string) => {
    const r = await git.raw(["show", `${sha}:${path}`], { cwd: refs.repoRoot });
    return r.exitCode === 0 ? r.stdout : null;
  };

  const extraction = await step(
    "extract",
    () =>
      extractWithLlm({
        llm: deps.llm,
        summary,
        changedPaths: changeSet.files.map((f) => f.path),
        repoName: refs.repoRoot.split("/").pop() ?? "",
      }),
    (e) => `${e.claims.length} claims${e.degraded ? " (degraded)" : ""}`,
  );
  const claims = extraction.claims;

  const mappings = new Map<string, Mapping>();
  await step(
    "scope",
    async () => {
      for (const claim of claims) {
        if (!SCOPE_TYPES.has(claim.type)) continue;
        const concept = claimConcept(claim);
        if (!concept || mappings.has(concept)) continue;
        mappings.set(
          concept,
          await mapScope({
            concept,
            files: filesAtHead,
            overrides: { ...config.userScope, ...config.scopeOverrides },
            llm: config.offline ? null : deps.llm,
          }),
        );
      }
    },
    () => `${mappings.size} concepts`,
  );

  const execEnabled = config.exec && input.execStage !== undefined;
  const stage = execEnabled ? input.execStage : undefined;
  const ctxBase = { repoRoot: refs.repoRoot, baseSha: refs.baseSha, headSha: refs.headSha };
  const suite = stage ? await step("suite", () => stage.runSuite(ctxBase), (s) => (s ? `${s.passed}/${s.total}` : "no runner")) : null;
  const bitechecks = new Map<string, BitecheckResult>();
  const commands = new Map<string, { exitCode: number; durationMs: number; stderrTail: string; command: string }>();
  if (stage) {
    for (const claim of claims) {
      if (claim.type === "tests_added" || claim.type === "bug_fixed") {
        const bc = await stage.bitecheck(claim, { ...ctxBase, changedFiles: changeSet.files.map((f) => f.path) });
        if (bc) bitechecks.set(claim.id, bc);
      } else if (claim.type === "build_pass" && claim.command) {
        const run = await stage.runCommand(claim.command, ctxBase);
        if (run) commands.set(claim.command, run);
      }
    }
  } else {
    trace.push({ step: "suite", ms: 0, status: "skipped", detail: "execution disabled" });
  }

  const vctx: VerifyContext = {
    changeSet, filesAtHead, mappings, suite, bitechecks, commands, flags: [], execEnabled,
    readFileAtHead: (path) => show(refs.headSha, path),
  };

  const verdicts: Verdict[] = [];
  await step("verify", async () => {
    for (const claim of claims) {
      const verdict = await verifyClaim(claim, vctx);
      verdicts.push(verdict);
      events.emit({ type: "claim.verdict", runId, claimId: claim.id, status: verdict.status, reason: verdict.reason });
    }
  }, () => `${verdicts.length} verdicts`);

  // Tamper flags attach to the tests_pass claim when one exists, otherwise they are global.
  const flags: Flag[] = await step("tamper", async () => {
    const found = tamperFlags(changeSet);
    const integrity = await countIntegrity({
      changeSet, summary,
      readAtBase: (p) => show(refs.baseSha, p),
      readAtHead: (p) => show(refs.headSha, p),
    });
    if (integrity.flag) found.push(integrity.flag);
    return found;
  }, (f) => `${f.length} flags`);
  const passIndex = claims.findIndex((c) => c.type === "tests_pass");
  const globalFlags: Flag[] = [];
  const passVerdict = passIndex >= 0 ? verdicts[passIndex] : undefined;
  if (passVerdict) passVerdict.flags.push(...flags);
  else globalFlags.push(...flags);

  claims.forEach((claim, i) => {
    const verdict = verdicts[i];
    if (verdict) verdict.repair = repairText(claim, verdict);
  });

  const undisclosed = undisclosedChanges(changeSet.files, verdicts, claims);
  const overall = overallPolicy(verdicts, globalFlags, undisclosed);
  const sums = totals(verdicts, globalFlags);
  const claimPairs = claims.map((claim, i) => ({ claim, verdict: verdicts[i] as Verdict }));
  const open = claimPairs.filter((p) => p.verdict.status === "contradicted");
  const chainId = runId.replace(/[^a-z0-9]/gi, "").slice(0, 10);

  const receipt: Receipt = {
    schemaVersion: 1,
    id: runId,
    runId,
    createdAt: clock.iso(),
    input: {
      mode: "local", agent: config.agent, summary,
      repo: null, pr: null, base: refs.baseSha, head: refs.headSha, headIsSnapshot: refs.headIsSnapshot,
      alan: config.alan,
    },
    chain: {
      chainId, parentId: null, attempt: 1,
      items: open.map((p) => ({ key: p.claim.id, quote: p.claim.quote, status: "open" as const, sinceAttempt: 1, resolvedAttempt: null })),
      outcome: open.length === 0 ? "first_attempt" : "unresolved",
    },
    actor: { agent: config.agent, model: config.model, role: config.role },
    claims: claimPairs,
    undisclosed,
    globalFlags,
    totals: sums,
    overall,
    model: { provider: extraction.provider, id: extraction.model, degraded: extraction.degraded },
    trace,
    durationMs: clock.now() - started,
    tool: { name: "nocap", version: NOCAP_VERSION },
  };
  events.emit({ type: "receipt.done", runId, id: receipt.id, overall, totals: sums, durationMs: receipt.durationMs });
  const repair = open.length > 0 ? buildRepairPacket(chainId, 1, overall, claimPairs) : null;
  return { receipt, repair };
}
