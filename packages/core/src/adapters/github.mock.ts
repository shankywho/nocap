import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { GithubCheckRuns, GithubFile, GithubPort, GithubPrMeta, GithubStatus, GithubTree } from "../ports.js";

export const DEMO_REPO = { owner: "demo", repo: "fixture-shop", number: 7 };

/** Serves the curated fictional PR demo/fixture-shop#7 from fixtures/github/*.json. */
export class MockGithub implements GithubPort {
  constructor(private readonly dir: string) {}
  private async read<T>(name: string): Promise<T> {
    return JSON.parse(await readFile(join(this.dir, name), "utf8")) as T;
  }
  private check(owner: string, repo: string, number?: number) {
    if (owner !== DEMO_REPO.owner || repo !== DEMO_REPO.repo || (number !== undefined && number !== DEMO_REPO.number)) {
      throw new Error(`MockGithub only serves ${DEMO_REPO.owner}/${DEMO_REPO.repo}#${DEMO_REPO.number}`);
    }
  }
  async getPullRequest(owner: string, repo: string, number: number) {
    this.check(owner, repo, number);
    return this.read<GithubPrMeta>("pr.json");
  }
  async listPullRequestFiles(owner: string, repo: string, number: number) {
    this.check(owner, repo, number);
    return this.read<GithubFile[]>("files.json");
  }
  async listCheckRuns(owner: string, repo: string) {
    this.check(owner, repo);
    return this.read<GithubCheckRuns>("checks.json");
  }
  async getCombinedStatus(owner: string, repo: string) {
    this.check(owner, repo);
    return this.read<GithubStatus>("status.json");
  }
  async getTree(owner: string, repo: string) {
    this.check(owner, repo);
    return this.read<GithubTree>("tree.json");
  }
}
