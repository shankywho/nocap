import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { buildFixtures, runFixtureGit } from "../../../scripts/build-fixtures";

const ROOT = fileURLToPath(new URL("../../..", import.meta.url));
const main = (...args: string[]) => execFileSync("git", args, { cwd: ROOT, encoding: "utf8" }).trim();
const snapshot = () => ({
  head: main("rev-parse", "HEAD"),
  author: main("log", "-1", "--format=%an <%ae>"),
  branch: main("branch", "--show-current"),
  branches: main("branch", "--list"),
  tags: main("tag", "--list"),
  count: main("rev-list", "--count", "HEAD"),
  stash: main("stash", "list"),
});

describe("fixture git isolation", () => {
  it("building every fixture leaves the main repo HEAD, author, branches, tags and stash unchanged", async () => {
    const before = snapshot();
    // A private cache inside the main repo's working tree (where the leak happened), so the shared
    // .cache/fixtures that other tests read is not rebuilt underneath them.
    const cacheDir = join(ROOT, ".cache", `iso-${process.pid}`);
    try {
      await buildFixtures({ quiet: true, cacheDir });
    } finally {
      await rm(cacheDir, { recursive: true, force: true });
    }
    const after = snapshot();
    expect(after).toEqual(before);
    expect(after.author).not.toContain("nocap fixture");
  }, 120_000);

  it("refuses to run git in the repo root, outside the cache, or in the cache dir itself", async () => {
    const cache = join(ROOT, ".cache", "fixtures");
    await expect(runFixtureGit(cache, ROOT, ROOT, ["status"])).rejects.toThrow(/refusing/);
    await expect(runFixtureGit(cache, ROOT, join(ROOT, "packages"), ["status"])).rejects.toThrow(/refusing/);
    await expect(runFixtureGit(cache, ROOT, cache, ["status"])).rejects.toThrow(/refusing/);
    await expect(runFixtureGit(ROOT, ROOT, join(ROOT, "x"), ["status"])).rejects.toThrow(/refusing/);
  });

  it("a fixture directory without its own .git cannot fall through to the parent repo", async () => {
    const before = snapshot();
    const cache = join(ROOT, ".cache", "fixtures-isolation-probe");
    const dest = join(cache, "no-git-here");
    mkdirSync(dest, { recursive: true });
    try {
      // dest sits inside the main repo's working tree; without a ceiling git would use the main repo.
      await expect(runFixtureGit(cache, ROOT, dest, ["commit", "--allow-empty", "-q", "-m", "must not happen"])).rejects.toThrow(/not a git repository/i);
      expect(snapshot()).toEqual(before);
    } finally {
      await rm(cache, { recursive: true, force: true });
    }
  });

  it("works for a cache outside the repo too", async () => {
    const tmp = await mkdtemp(join(tmpdir(), "nocap-iso-"));
    try {
      const built = await buildFixtures({ quiet: true, cacheDir: tmp, scenarios: ["honest"] });
      expect(built).toHaveLength(1);
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  }, 60_000);
});
