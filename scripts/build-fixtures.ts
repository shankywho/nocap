/**
 * Materialises each fixture scenario into `.cache/fixtures/<name>`:
 * a real git repo with a deterministic base commit and an agent change.
 *
 * Deterministic author and dates keep commit SHAs stable so golden receipts
 * can be compared across machines.
 */
import { cp, mkdir, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { execa } from "execa";

export const SCENARIOS = [
  "honest",
  "toothless",
  "tampered",
  "scope_violation",
  "denominator",
  "untracked",
  "tdd_trap",
  "fake_refactor",
] as const;

export type ScenarioName = (typeof SCENARIOS)[number];

export interface BuildFixtureOptions {
  root?: string;
  scenarios?: readonly string[];
  quiet?: boolean;
}

export interface BuiltScenario {
  name: string;
  repoPath: string;
  baseSha: string;
  headSha: string;
  mode: "commit" | "worktree";
}

const FIXED_DATE = "2026-10-26T13:00:00+05:30";
const FIXED_DATE_AGENT = "2026-10-26T13:05:00+05:30";

function gitEnv(date: string, extra: Record<string, string> = {}): Record<string, string> {
  return {
    PATH: process.env.PATH ?? "",
    HOME: process.env.HOME ?? "",
    GIT_AUTHOR_NAME: "nocap fixture",
    GIT_AUTHOR_EMAIL: "fixture@nocap.dev",
    GIT_COMMITTER_NAME: "nocap fixture",
    GIT_COMMITTER_EMAIL: "fixture@nocap.dev",
    GIT_AUTHOR_DATE: date,
    GIT_COMMITTER_DATE: date,
    ...extra,
  };
}

async function git(cwd: string, args: string[], date = FIXED_DATE): Promise<string> {
  const result = await execa("git", args, {
    cwd,
    env: gitEnv(date),
    extendEnv: false,
    reject: false,
  });
  if (result.exitCode !== 0) {
    throw new Error(`git ${args.join(" ")} failed in ${cwd}: ${result.stderr}`);
  }
  return result.stdout;
}

async function copyTree(from: string, to: string, skip: (path: string) => boolean): Promise<void> {
  await cp(from, to, {
    recursive: true,
    filter: (source) => !skip(source),
  });
}

async function listFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listFiles(path)));
    } else if (entry.isFile()) {
      files.push(path);
    }
  }
  return files;
}

export async function buildFixtures(opts: BuildFixtureOptions = {}): Promise<BuiltScenario[]> {
  const root = opts.root ?? fileURLToPath(new URL("..", import.meta.url));
  const names = opts.scenarios ?? SCENARIOS;
  const base = join(root, "fixtures", "project");
  const cache = join(root, ".cache", "fixtures");
  const built: BuiltScenario[] = [];

  await mkdir(cache, { recursive: true });

  for (const name of names) {
    const scenarioDir = join(root, "fixtures", "scenarios", name);
    const dest = join(cache, name);
    await rm(dest, { recursive: true, force: true });
    await mkdir(dest, { recursive: true });

    await copyTree(base, dest, (source) => {
      const rel = relative(base, source);
      return rel === "node_modules" || rel.startsWith(`node_modules${"/"}`) || rel === ".git";
    });

    await symlink(join(root, "node_modules"), join(dest, "node_modules"), "junction");

    await git(dest, ["init", "-q", "-b", "main"]);
    await git(dest, ["config", "core.autocrlf", "false"]);
    await git(dest, ["config", "core.fileMode", "false"]);
    await git(dest, ["add", "-A"]);
    await git(dest, ["commit", "-q", "-m", "base"]);
    const baseSha = (await git(dest, ["rev-parse", "HEAD"])).trim();

    const overlay = join(scenarioDir, "overlay");
    for (const file of await listFiles(overlay)) {
      const target = join(dest, relative(overlay, file));
      await mkdir(dirname(target), { recursive: true });
      await cp(file, target);
    }

    const deleteFile = join(scenarioDir, "delete.txt");
    try {
      const list = await readFile(deleteFile, "utf8");
      for (const line of list.split("\n")) {
        const path = line.trim();
        if (path) await rm(join(dest, path), { force: true });
      }
    } catch {
      // no delete.txt for this scenario
    }

    const mode = (await readFile(join(scenarioDir, "mode.txt"), "utf8")).trim();
    let headSha = baseSha;
    if (mode === "commit") {
      await git(dest, ["add", "-A"]);
      await git(dest, ["commit", "-q", "-m", "agent change"], FIXED_DATE_AGENT);
      headSha = (await git(dest, ["rev-parse", "HEAD"])).trim();
    } else if (mode !== "worktree") {
      throw new Error(`scenario ${name}: unknown mode "${mode}"`);
    }

    await writeFile(
      join(cache, `${name}.json`),
      `${JSON.stringify({ name, baseSha, headSha, mode }, null, 2)}\n`,
      "utf8",
    );

    built.push({ name, repoPath: dest, baseSha, headSha, mode: mode as "commit" | "worktree" });
    if (!opts.quiet) console.log(`  ${name.padEnd(16)} ${baseSha.slice(0, 7)} → ${headSha.slice(0, 7)} (${mode})`);
  }

  return built;
}

const isDirectRun =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  const only = process.argv.slice(2).filter((arg) => !arg.startsWith("-"));
  const list = only.length > 0 ? only : undefined;
  console.log(`building fixtures${list ? `: ${list.join(", ")}` : ""}`);
  buildFixtures({ scenarios: list })
    .then((built) => console.log(`built ${built.length} scenario(s) in .cache/fixtures`))
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    });
}