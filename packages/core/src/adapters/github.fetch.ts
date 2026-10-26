import type { GithubCheckRuns, GithubFile, GithubPort, GithubPrMeta, GithubStatus, GithubTree } from "../ports.js";

export class GithubUnavailable extends Error {}

type Json = Record<string, unknown>;

/** GitHub REST over fetch. Sends a bearer token when one is configured; rate limits and bad payloads become GithubUnavailable. */
export class FetchGithub implements GithubPort {
  constructor(private readonly token: string | null = null, private readonly fetchImpl: typeof fetch = fetch) {}

  private async get(path: string): Promise<unknown> {
    const res = await this.fetchImpl(`https://api.github.com${path}`, {
      headers: { accept: "application/vnd.github+json", "user-agent": "nocap", ...(this.token ? { authorization: `Bearer ${this.token}` } : {}) },
    });
    if (res.status === 403 || res.status === 429) throw new GithubUnavailable("GitHub rate limit reached. Try again later or set GITHUB_TOKEN.");
    if (res.status === 404) throw new GithubUnavailable("PR not found, or the repository is private.");
    if (!res.ok) throw new GithubUnavailable(`GitHub returned ${res.status}.`);
    try {
      return await res.json();
    } catch {
      throw new GithubUnavailable("GitHub returned a malformed response.");
    }
  }

  async getPullRequest(owner: string, repo: string, number: number): Promise<GithubPrMeta> {
    const pr = (await this.get(`/repos/${owner}/${repo}/pulls/${number}`)) as { title?: string; body?: string | null; base?: { sha?: string }; head?: { sha?: string } };
    if (!pr.base?.sha || !pr.head?.sha) throw new GithubUnavailable("GitHub returned a malformed PR.");
    return { owner, repo, number, title: pr.title ?? "", body: pr.body ?? "", baseSha: pr.base.sha, headSha: pr.head.sha };
  }

  async listPullRequestFiles(owner: string, repo: string, number: number): Promise<GithubFile[]> {
    const out: GithubFile[] = [];
    for (let page = 1; page <= 30; page++) {
      const batch = (await this.get(`/repos/${owner}/${repo}/pulls/${number}/files?per_page=100&page=${page}`)) as Json[];
      if (!Array.isArray(batch)) throw new GithubUnavailable("GitHub returned a malformed file list.");
      for (const f of batch) {
        out.push({
          filename: String(f.filename),
          status: (f.status === "unchanged" ? "changed" : f.status) as GithubFile["status"],
          additions: Number(f.additions ?? 0),
          deletions: Number(f.deletions ?? 0),
          patch: typeof f.patch === "string" ? f.patch : null,
          previousFilename: typeof f.previous_filename === "string" ? f.previous_filename : null,
        });
      }
      if (batch.length < 100) break;
    }
    return out;
  }

  async listCheckRuns(owner: string, repo: string, ref: string): Promise<GithubCheckRuns> {
    const r = (await this.get(`/repos/${owner}/${repo}/commits/${ref}/check-runs?per_page=100`)) as { total_count?: number; check_runs?: { name: string; status: string; conclusion: string | null }[] };
    const runs = (r.check_runs ?? []).map((c) => ({ name: c.name, status: c.status, conclusion: c.conclusion }));
    return { total: r.total_count ?? runs.length, runs };
  }

  async getCombinedStatus(owner: string, repo: string, ref: string): Promise<GithubStatus> {
    const r = (await this.get(`/repos/${owner}/${repo}/commits/${ref}/status`)) as { state?: GithubStatus["state"]; statuses?: { context: string; state: string }[] };
    return { state: r.state ?? "pending", statuses: (r.statuses ?? []).map((s) => ({ context: s.context, state: s.state })) };
  }

  async getTree(owner: string, repo: string, ref: string): Promise<GithubTree> {
    const r = (await this.get(`/repos/${owner}/${repo}/git/trees/${ref}?recursive=1`)) as { truncated?: boolean; tree?: { path: string; type: string }[] };
    return { truncated: r.truncated === true, paths: (r.tree ?? []).filter((t) => t.type === "blob").map((t) => t.path) };
  }
}
