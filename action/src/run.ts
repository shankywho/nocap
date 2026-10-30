import { readFileSync } from "node:fs";
import { appendFileSync } from "node:fs";
import { renderMarkdown, type Receipt } from "@nocap/core";
import { verifyLocal, type LocalVerifyResult } from "@nocap/core/adapters";

export const MARKER = "<!-- nocap-receipt -->";

type Env = Record<string, string | undefined>;
type Verify = (opts: Parameters<typeof verifyLocal>[0], env: Record<string, string | undefined>) => Promise<LocalVerifyResult>;

export interface ActionDeps {
  verify?: Verify;
  fetchImpl?: typeof fetch;
  log?: (line: string) => void;
}

interface PrEvent {
  pull_request?: {
    number: number;
    body: string | null;
    base: { sha: string; repo: { full_name: string } };
    head: { sha: string; repo: { full_name: string } | null };
  };
}

export interface ActionResult {
  exitCode: number;
  overall: Receipt["overall"] | null;
  commented: boolean;
  skipped: string | null;
}

const input = (env: Env, name: string) => env[`INPUT_${name.toUpperCase().replace(/-/g, "_")}`]?.trim() ?? "";

/** Runs nocap on a PR checkout and comments the receipt markdown. Same-repo PRs only: fork PRs get a read-only token. */
export async function runAction(env: Env, deps: ActionDeps = {}): Promise<ActionResult> {
  const log = deps.log ?? (() => undefined);
  const doFetch = deps.fetchImpl ?? fetch;
  const verify = deps.verify ?? verifyLocal;

  const eventPath = env.GITHUB_EVENT_PATH;
  const event = (eventPath ? JSON.parse(readFileSync(eventPath, "utf8")) : {}) as PrEvent;
  const pr = event.pull_request;
  if (!pr) return { exitCode: 0, overall: null, commented: false, skipped: "not a pull_request event" };
  if (!pr.head.repo || pr.head.repo.full_name !== pr.base.repo.full_name) {
    log("nocap: skipping a fork PR (the token is read-only and secrets are unavailable).");
    return { exitCode: 0, overall: null, commented: false, skipped: "fork pull request" };
  }

  const summary = input(env, "summary") || (pr.body ?? "").trim();
  if (!summary) return { exitCode: 0, overall: null, commented: false, skipped: "no summary: the PR description is empty" };

  // The verifier never sees the GitHub token. The LLM key is passed only when the workflow provides one.
  const apiKey = input(env, "llm-api-key");
  const childEnv: Record<string, string | undefined> = {
    PATH: env.PATH,
    HOME: env.HOME,
    TMPDIR: env.RUNNER_TEMP ?? env.TMPDIR,
    ...(apiKey ? { LLM_API_KEY: apiKey, ...(input(env, "llm-base-url") ? { LLM_BASE_URL: input(env, "llm-base-url") } : {}), ...(input(env, "llm-model") ? { LLM_MODEL: input(env, "llm-model") } : {}) } : { NOCAP_OFFLINE: "1" }),
  };
  const { receipt } = await verify(
    {
      repoPath: env.GITHUB_WORKSPACE ?? process.cwd(),
      summary,
      base: pr.base.sha,
      head: pr.head.sha,
      agent: input(env, "agent") || "unknown",
      exec: input(env, "exec") !== "false",
      offline: !apiKey,
      save: false,
    },
    childEnv,
  );

  const body = `${MARKER}\n${renderMarkdown(receipt)}`;
  let commented = false;
  const token = input(env, "github-token");
  const repo = pr.base.repo.full_name;
  if (token) {
    const api = (path: string, init?: RequestInit) =>
      doFetch(`https://api.github.com/repos/${repo}${path}`, {
        ...init,
        headers: { accept: "application/vnd.github+json", authorization: `Bearer ${token}`, "user-agent": "nocap-action", ...(init?.headers ?? {}) },
      });
    const list = await api(`/issues/${pr.number}/comments?per_page=100`);
    const existing = list.ok ? ((await list.json()) as { id: number; body?: string }[]).find((c) => c.body?.startsWith(MARKER)) : undefined;
    const res = existing
      ? await api(`/issues/comments/${existing.id}`, { method: "PATCH", body: JSON.stringify({ body }) })
      : await api(`/issues/${pr.number}/comments`, { method: "POST", body: JSON.stringify({ body }) });
    commented = res.ok;
    if (!res.ok) log(`nocap: could not comment (HTTP ${res.status}). Check that the workflow has pull-requests: write.`);
  }

  if (env.GITHUB_OUTPUT) appendFileSync(env.GITHUB_OUTPUT, `overall=${receipt.overall}\nreceipt-id=${receipt.id}\n`);
  const failOn = input(env, "fail-on") || "fail";
  const failed = failOn === "never" ? false : receipt.overall === "FAIL" || (failOn === "mixed" && receipt.overall === "MIXED");
  return { exitCode: failed ? 1 : 0, overall: receipt.overall, commented, skipped: null };
}
