import { changeSetFromPatches } from "../git/diff.js";
import { NocapEvents } from "../events.js";
import { extractWithLlm } from "../extract/llmExtractor.js";
import type { Mapping } from "../extract/keywordScope.js";
import { mapScope } from "../extract/scopeMapper.js";
import { overallPolicy, totals } from "../policy/overall.js";
import { repairText } from "../policy/repair.js";
import type { ClockPort, GithubPort, LlmPort } from "../ports.js";
import type { Claim } from "../schema/claim.js";
import type { Evidence } from "../schema/evidence.js";
import type { Receipt, TraceStep } from "../schema/receipt.js";
import type { Flag, Verdict } from "../schema/verdict.js";
import { tamperFlags } from "../tamper/rules.js";
import { claimConcept, contradicted, unverifiable, verified, type VerifyContext } from "../verifiers/helpers.js";
import { undisclosedChanges, verifyClaim } from "../verifiers/index.js";
import { itemKey } from "../loop/antiGaming.js";
import { NOCAP_VERSION } from "../version.js";

export class PrUrlError extends Error {}

export function parsePrUrl(url: string): { owner: string; repo: string; number: number } {
  const m = /^https:\/\/github\.com\/([\w.-]+)\/([\w.-]+)\/pull\/(\d+)\/?(?:[?#].*)?$/.exec(url.trim());
  if (!m) throw new PrUrlError("Expected a URL like https://github.com/owner/repo/pull/123");
  return { owner: m[1] as string, repo: m[2] as string, number: Number(m[3]) };
}

export interface PrVerifyInput {
  prUrl: string;
  summary?: string;
  agent?: string;
  runId: string;
  github: GithubPort;
  llm: LlmPort;
  clock: ClockPort;
  events?: NocapEvents;
}

const SCOPE_TYPES = new Set(["scope_none", "scope_only"]);
const GOOD = new Set(["success", "neutral", "skipped"]);
const BAD = new Set(["failure", "timed_out", "cancelled", "error"]);

/** tests_pass in PR mode comes from CI, not from re-running the suite (§9.4). */
function ciVerdict(runs: { name: string; status: string; conclusion: string | null }[], statuses: { context: string; state: string }[], sha: string): Verdict {
  const all = [
    ...runs.map((r) => ({ name: r.name, done: r.status === "completed", state: r.conclusion ?? "" })),
    ...statuses.map((s) => ({ name: s.context, done: s.state !== "pending", state: s.state })),
  ];
  const failing = all.filter((c) => c.done && BAD.has(c.state));
  const pending = all.filter((c) => !c.done);
  const evidence: Evidence[] = [
    { kind: "checkRuns", sha, total: all.length, success: all.filter((c) => c.done && GOOD.has(c.state)).length, failure: failing.length, pending: pending.length, names: (failing.length ? failing : all).map((c) => c.name).slice(0, 20) },
  ];
  if (failing.length > 0) return contradicted(`CI failing on ${sha.slice(0, 7)}: ${failing.map((c) => c.name).join(", ")}.`, evidence);
  if (all.length === 0 || pending.length > 0) return unverifiable(all.length === 0 ? "No CI checks exist on head." : "CI checks are still pending.", evidence);
  return verified(`CI green on ${sha.slice(0, 7)} (${all.length} checks). Counts not verified in PR mode.`, evidence);
}

/** Static PR pipeline: GitHub meta + patches + CI → extract → map → static verifiers → policy. No execution, no checkout. */
export async function prVerify(input: PrVerifyInput): Promise<Receipt> {
  const { github, llm, clock, runId } = input;
  const events = input.events ?? new NocapEvents();
  const started = clock.now();
  const trace: TraceStep[] = [];
  async function step<T>(name: string, fn: () => Promise<T>, detail: (v: T) => string = () => ""): Promise<T> {
    const t0 = clock.now();
    events.emit({ type: "step.start", runId, step: name, at: t0 });
    try {
      const v = await fn();
      const text = detail(v).slice(0, 300);
      trace.push({ step: name, ms: clock.now() - t0, status: "ok", detail: text });
      events.emit({ type: "step.end", runId, step: name, ms: clock.now() - t0, status: "ok", detail: text });
      return v;
    } catch (error) {
      const text = (error instanceof Error ? error.message : String(error)).slice(0, 300);
      trace.push({ step: name, ms: clock.now() - t0, status: "error", detail: text });
      events.emit({ type: "step.end", runId, step: name, ms: clock.now() - t0, status: "error", detail: text });
      throw error;
    }
  }

  const { owner, repo, number } = parsePrUrl(input.prUrl);
  const meta = await step("github", () => github.getPullRequest(owner, repo, number), (m) => `${owner}/${repo}#${number} ${m.baseSha.slice(0, 7)}..${m.headSha.slice(0, 7)}`);
  const summary = (input.summary?.trim() ? input.summary : meta.body).trim();
  if (!summary) throw new PrUrlError("The PR has no description and no summary was provided.");
  const files = await step("diff", () => github.listPullRequestFiles(owner, repo, number), (f) => `${f.length} files`);
  const changeSet = changeSetFromPatches(meta.baseSha, meta.headSha, files);
  const [checks, status, tree] = await Promise.all([
    github.listCheckRuns(owner, repo, meta.headSha),
    github.getCombinedStatus(owner, repo, meta.headSha),
    github.getTree(owner, repo, meta.headSha),
  ]);
  const filesAtHead = tree.paths;

  const extraction = await step("extract", () => extractWithLlm({ llm, summary, changedPaths: changeSet.files.map((f) => f.path), repoName: repo }), (e) => `${e.claims.length} claims${e.degraded ? " (degraded)" : ""}`);
  const claims: Claim[] = extraction.claims;

  const mappings = new Map<string, Mapping>();
  await step("scope", async () => {
    for (const claim of claims) {
      if (!SCOPE_TYPES.has(claim.type)) continue;
      const concept = claimConcept(claim);
      if (!concept || mappings.has(concept)) continue;
      mappings.set(concept, await mapScope({ concept, files: filesAtHead, overrides: claim.subject === null && claim.paths.length > 0 ? { [concept]: claim.paths } : {}, llm }));
    }
  }, () => `${mappings.size} concepts`);

  const ctx: VerifyContext = { changeSet, filesAtHead, mappings, suite: null, bitechecks: new Map(), commands: new Map(), flags: [], execEnabled: false, readFileAtHead: async () => null };
  const verdicts: Verdict[] = [];
  await step("verify", async () => {
    for (const claim of claims) {
      const v = claim.type === "tests_pass" ? ciVerdict(checks.runs, status.statuses, meta.headSha) : await verifyClaim(claim, ctx);
      if (v.status === "unverifiable" && ["tests_added", "bug_fixed", "build_pass"].includes(claim.type)) {
        v.reason = "Proving this needs execution: run `npx nocap check` locally.";
      }
      verdicts.push(v);
      events.emit({ type: "claim.verdict", runId, claimId: claim.id, status: v.status, reason: v.reason });
    }
  }, () => `${verdicts.length} verdicts`);

  const flags: Flag[] = tamperFlags(changeSet);
  const passIndex = claims.findIndex((c) => c.type === "tests_pass");
  const globalFlags: Flag[] = [];
  const passVerdict = passIndex >= 0 ? verdicts[passIndex] : undefined;
  if (passVerdict) passVerdict.flags.push(...flags);
  else globalFlags.push(...flags);
  claims.forEach((claim, i) => {
    const v = verdicts[i];
    if (v) v.repair = repairText(claim, v);
  });

  const undisclosed = undisclosedChanges(changeSet.files, verdicts, claims);
  const pairs = claims.map((claim, i) => ({ claim, verdict: verdicts[i] as Verdict }));
  const open = pairs.filter((p) => p.verdict.status === "contradicted");
  const overall = overallPolicy(verdicts, globalFlags, undisclosed);
  const sums = totals(verdicts, globalFlags);
  const chainId = runId.replace(/[^a-z0-9]/gi, "").slice(0, 10);
  const receipt: Receipt = {
    schemaVersion: 1, id: runId, runId, createdAt: clock.iso(),
    input: { mode: "pr", agent: input.agent ?? "unknown", summary, repo: `${owner}/${repo}`, pr: number, base: meta.baseSha, head: meta.headSha, headIsSnapshot: false, alan: null },
    chain: {
      chainId, parentId: null, attempt: 1,
      items: open.map((p) => ({ key: itemKey(p.claim.quote), quote: p.claim.quote, status: "open" as const, sinceAttempt: 1, resolvedAttempt: null })),
      outcome: open.length === 0 ? "first_attempt" : "unresolved",
    },
    actor: { agent: input.agent ?? "unknown", model: null, role: null },
    claims: pairs, undisclosed, globalFlags, totals: sums, overall,
    model: { provider: extraction.provider, id: extraction.model, degraded: extraction.degraded },
    trace, durationMs: clock.now() - started, tool: { name: "nocap", version: NOCAP_VERSION },
  };
  events.emit({ type: "receipt.done", runId, id: receipt.id, overall, totals: sums, durationMs: receipt.durationMs });
  return receipt;
}
