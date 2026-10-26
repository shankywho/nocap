import { afterEach, describe, expect, it } from "vitest";
import { readChangeSet } from "../src/git/diff";
import { makeTestRepo, type TestRepo } from "./helpers/repo";

let repo: TestRepo | undefined;

afterEach(async () => {
  await repo?.cleanup();
  repo = undefined;
});

describe("readChangeSet", () => {
  it("parses additions, modifications, deletions, renames and binary files", async () => {
    repo = await makeTestRepo();
    await repo.write("src/keep.ts", "export const a = 1;\n");
    await repo.write("src/gone.ts", "export const b = 2;\n");
    await repo.write("src/moved.ts", Array.from({ length: 50 }, (_, i) => `line ${i}`).join("\n"));
    await repo.write("assets/logo.bin", "\u0000\u0001binary");
    await repo.run("add", "-A");
    await repo.run("commit", "-qm", "base");
    const base = (await repo.run("rev-parse", "HEAD")).trim();

    await repo.write("src/keep.ts", "export const a = 2;\n");
    await repo.write("src/new.ts", "export const c = 3;\n");
    await repo.run("rm", "-q", "src/gone.ts");
    await repo.run("mv", "src/moved.ts", "src/renamed file.ts");
    await repo.write("assets/logo.bin", "\u0000\u0002binary");
    await repo.run("add", "-A");
    await repo.run("commit", "-qm", "change");
    const head = (await repo.run("rev-parse", "HEAD")).trim();

    const changeSet = await readChangeSet({
      git: repo.git,
      repoPath: repo.path,
      baseSha: base,
      headSha: head,
    });

    const byPath = new Map(changeSet.files.map((file) => [file.path, file]));
    expect(byPath.get("src/keep.ts")?.status).toBe("M");
    expect(byPath.get("src/keep.ts")?.additions).toBe(1);
    expect(byPath.get("src/keep.ts")?.deletions).toBe(1);
    expect(byPath.get("src/new.ts")?.status).toBe("A");
    expect(byPath.get("src/gone.ts")?.status).toBe("D");
    expect(byPath.get("src/renamed file.ts")?.status).toBe("R");
    expect(byPath.get("src/renamed file.ts")?.previousPath).toBe("src/moved.ts");
    expect(byPath.get("assets/logo.bin")?.isBinary).toBe(true);

    const hunkPaths = changeSet.hunks.map((hunk) => hunk.path);
    expect(hunkPaths).toContain("src/keep.ts");
    expect(hunkPaths).toContain("src/new.ts");
    const keepHunk = changeSet.hunks.find((hunk) => hunk.path === "src/keep.ts");
    expect(keepHunk?.lines.map((line) => line.type)).toEqual(["del", "add"]);
  });

  it("keeps file lists sorted by path", async () => {
    repo = await makeTestRepo();
    await repo.write("b.ts", "b\n");
    await repo.write("a.ts", "a\n");
    await repo.run("add", "-A");
    await repo.run("commit", "-qm", "base");
    const base = (await repo.run("rev-parse", "HEAD")).trim();
    await repo.write("a.ts", "a2\n");
    await repo.write("c.ts", "c\n");
    await repo.run("add", "-A");
    await repo.run("commit", "-qm", "change");
    const head = (await repo.run("rev-parse", "HEAD")).trim();

    const changeSet = await readChangeSet({
      git: repo.git,
      repoPath: repo.path,
      baseSha: base,
      headSha: head,
    });
    expect(changeSet.files.map((file) => file.path)).toEqual(["a.ts", "c.ts"]);
  });
});
