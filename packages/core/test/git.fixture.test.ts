import { stat } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildFixtures } from "../../../scripts/build-fixtures";
import { readChangeSet } from "../src/git/diff";
import { resolveRefs } from "../src/git/resolve";
import { listWorktrees } from "../src/git/worktree";
import { FixedClock, NodeFs, SimpleGitPort } from "@nocap/core/adapters";

const root = fileURLToPath(new URL("../../..", import.meta.url));

describe("fixture repos", () => {
  const fs = new NodeFs();
  const clock = new FixedClock();

  beforeAll(async () => {
    await buildFixtures({ scenarios: ["untracked", "honest"], quiet: true });
  });

  afterAll(async () => {
    await buildFixtures({ scenarios: ["untracked", "honest"], quiet: true });
  });

  it("keeps the working tree of the untracked scenario untouched", async () => {
    const repoPath = join(root, ".cache", "fixtures", "untracked");
    const git = new SimpleGitPort(repoPath);

    const statusBefore = await git.raw(["status", "--porcelain"], { cwd: repoPath });
    const stashBefore = await git.raw(["stash", "list"], { cwd: repoPath });
    const headBefore = await git.raw(["rev-parse", "HEAD"], { cwd: repoPath });
    const branchesBefore = await git.raw(["branch", "--list"], { cwd: repoPath });
    const indexBefore = await stat(join(repoPath, ".git", "index"));
    const worktreesBefore = await listWorktrees(git, repoPath);

    const resolved = await resolveRefs({
      git,
      fs,
      clock,
      repoPath,
      runId: "fixture-untracked",
    });

    expect(resolved.headIsSnapshot).toBe(true);
    expect((await git.raw(["status", "--porcelain"], { cwd: repoPath })).stdout).toBe(
      statusBefore.stdout,
    );
    expect((await git.raw(["stash", "list"], { cwd: repoPath })).stdout).toBe(stashBefore.stdout);
    expect((await git.raw(["rev-parse", "HEAD"], { cwd: repoPath })).stdout).toBe(
      headBefore.stdout,
    );
    expect((await git.raw(["branch", "--list"], { cwd: repoPath })).stdout).toBe(
      branchesBefore.stdout,
    );
    expect((await stat(join(repoPath, ".git", "index"))).mtimeMs).toBe(indexBefore.mtimeMs);
    expect(await listWorktrees(git, repoPath)).toEqual(worktreesBefore);

    const changeSet = await readChangeSet({
      git,
      repoPath,
      baseSha: resolved.baseSha,
      headSha: resolved.headSha,
    });
    expect(changeSet.files.map((file) => file.path).sort()).toEqual([
      "src/backoff.ts",
      "test/backoff.test.ts",
    ]);
  });

  it("sees only the agent commit in the committed scenario", async () => {
    const repoPath = join(root, ".cache", "fixtures", "honest");
    const git = new SimpleGitPort(repoPath);
    const resolved = await resolveRefs({
      git,
      fs,
      clock,
      repoPath,
      runId: "fixture-honest",
    });
    expect(resolved.headIsSnapshot).toBe(false);
    const changeSet = await readChangeSet({
      git,
      repoPath,
      baseSha: resolved.baseSha,
      headSha: resolved.headSha,
    });
    expect(changeSet.files.map((file) => file.path).sort()).toEqual([
      "src/retry.ts",
      "test/retry.test.ts",
    ]);
  });
});
