import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createWorktree, listWorktrees, withWorktree } from "../src/git/worktree";
import { makeTestRepo, type TestRepo } from "./helpers/repo";

let repo: TestRepo | undefined;

afterEach(async () => {
  await repo?.cleanup();
  repo = undefined;
});

describe("worktrees", () => {
  it("creates a detached checkout and removes it again", async () => {
    repo = await makeTestRepo();
    await repo.write("a.ts", "a\n");
    await repo.run("add", "-A");
    await repo.run("commit", "-qm", "base");
    const head = (await repo.run("rev-parse", "HEAD")).trim();

    const before = await listWorktrees(repo.git, repo.path);
    const worktree = await createWorktree({
      git: repo.git,
      fs: repo.fs,
      repoRoot: repo.path,
      ref: head,
      runId: "wt-1",
    });
    expect(await repo.fs.exists(join(worktree.path, "a.ts"))).toBe(true);
    expect((await listWorktrees(repo.git, repo.path)).length).toBe(before.length + 1);

    await worktree.remove();
    expect((await listWorktrees(repo.git, repo.path)).length).toBe(before.length);
    expect(await repo.fs.exists(worktree.path)).toBe(false);
  });

  it("removes the worktree even when the body throws", async () => {
    repo = await makeTestRepo();
    await repo.write("a.ts", "a\n");
    await repo.run("add", "-A");
    await repo.run("commit", "-qm", "base");
    const head = (await repo.run("rev-parse", "HEAD")).trim();
    const before = await listWorktrees(repo.git, repo.path);

    await expect(
      withWorktree(
        { git: repo.git, fs: repo.fs, repoRoot: repo.path, ref: head, runId: "wt-2" },
        async () => {
          throw new Error("boom");
        },
      ),
    ).rejects.toThrow("boom");

    expect((await listWorktrees(repo.git, repo.path)).length).toBe(before.length);
  });
});
