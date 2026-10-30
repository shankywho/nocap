import { stat } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { readChangeSet } from "../src/git/diff";
import { resolveRefs } from "../src/git/resolve";
import { makeTestRepo, type TestRepo } from "./helpers/repo";

let repo: TestRepo | undefined;

afterEach(async () => {
  await repo?.cleanup();
  repo = undefined;
});

describe("resolveRefs", () => {
  it("uses HEAD for base and head on a clean tree", async () => {
    repo = await makeTestRepo();
    await repo.write("a.ts", "a\n");
    await repo.run("add", "-A");
    await repo.run("commit", "-qm", "base");

    const resolved = await resolveRefs({
      git: repo.git,
      fs: repo.fs,
      clock: repo.clock,
      repoPath: repo.path,
      runId: "run-1",
    });
    const head = (await repo.run("rev-parse", "HEAD")).trim();
    expect(resolved.headSha).toBe(head);
    expect(resolved.headIsSnapshot).toBe(false);
    expect(resolved.baseSha).toBe(head);
  });

  it("snapshots a dirty tree without touching the user's index or branches", async () => {
    repo = await makeTestRepo();
    await repo.write("a.ts", "a\n");
    await repo.run("add", "-A");
    await repo.run("commit", "-qm", "base");
    const headBefore = (await repo.run("rev-parse", "HEAD")).trim();
    await repo.write("a.ts", "a modified\n");
    await repo.write("untracked.ts", "new file\n");

    const statusBefore = await repo.run("status", "--porcelain");
    const stashBefore = await repo.run("stash", "list");
    const branchesBefore = await repo.run("branch", "--list");
    const indexStatBefore = await stat(join(repo.path, ".git", "index"));

    const resolved = await resolveRefs({
      git: repo.git,
      fs: repo.fs,
      clock: repo.clock,
      repoPath: repo.path,
      runId: "run-2",
    });

    const indexStatAfter = await stat(join(repo.path, ".git", "index"));
    expect(indexStatAfter.mtimeMs).toBe(indexStatBefore.mtimeMs);

    expect(resolved.headIsSnapshot).toBe(true);
    expect(resolved.headSha).not.toBe(headBefore);
    expect(resolved.baseSha).toBe(headBefore);

    const changeSet = await readChangeSet({
      git: repo.git,
      repoPath: repo.path,
      baseSha: resolved.baseSha,
      headSha: resolved.headSha,
    });
    const paths = changeSet.files.map((file) => file.path).sort();
    expect(paths).toEqual(["a.ts", "untracked.ts"]);
    expect(changeSet.files.find((file) => file.path === "untracked.ts")?.status).toBe("A");

    // the working tree invariant: nothing about the user's git state moved
    expect(await repo.run("status", "--porcelain")).toBe(statusBefore);
    expect(await repo.run("stash", "list")).toBe(stashBefore);
    expect(await repo.run("branch", "--list")).toBe(branchesBefore);
    expect((await repo.run("rev-parse", "HEAD")).trim()).toBe(headBefore);
  });

  it("honours an explicit base and head", async () => {
    repo = await makeTestRepo();
    await repo.write("a.ts", "a\n");
    await repo.run("add", "-A");
    await repo.run("commit", "-qm", "base");
    const base = (await repo.run("rev-parse", "HEAD")).trim();
    await repo.write("a.ts", "b\n");
    await repo.run("add", "-A");
    await repo.run("commit", "-qm", "second");
    const head = (await repo.run("rev-parse", "HEAD")).trim();

    const resolved = await resolveRefs({
      git: repo.git,
      fs: repo.fs,
      clock: repo.clock,
      repoPath: repo.path,
      runId: "run-3",
      base,
      head,
    });
    expect(resolved.baseSha).toBe(base);
    expect(resolved.headSha).toBe(head);
    expect(resolved.headIsSnapshot).toBe(false);
  });

  it("fails with a friendly message when the base ref is unknown", async () => {
    repo = await makeTestRepo();
    await repo.write("a.ts", "a\n");
    await repo.run("add", "-A");
    await repo.run("commit", "-qm", "base");

    await expect(
      resolveRefs({
        git: repo.git,
        fs: repo.fs,
        clock: repo.clock,
        repoPath: repo.path,
        runId: "run-4",
        base: "does-not-exist",
      }),
    ).rejects.toThrow(/base ref not found/);
  });
});
