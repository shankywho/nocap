/**
 * Materialises each fixture scenario into `.cache/fixtures/<name>`:
 * a real git repo with a deterministic base commit and an agent change.
 *
 * Deterministic author and dates keep commit SHAs stable so golden receipts
 * can be compared across machines.
 */
import { existsSync } from "node:fs";
import { cp, mkdir, readFile, readdir, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
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
  "toothless_gamed",
] as const;

export type ScenarioName = (typeof SCENARIOS)[number];

export interface BuildFixtureOptions {
  root?: string;
  /** Override the output directory (defaults to <root>/.cache/fixtures). */
  cacheDir?: string;
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

/**
 * Runs git for a fixture repo. The fixed author/committer identity is passed only to child processes whose cwd is
 * strictly inside the fixture cache, never the main repository (an unguarded commit there once leaked an "agent change"
 * commit into main). GIT_CEILING_DIRECTORIES stops git from walking up into a parent repo when the fixture's own
 * .git is missing, so the command fails instead of committing to the wrong repo.
 */
export async function runFixtureGit(cacheRoot: string, repoRoot: string, cwd: string, args: string[], date = FIXED_DATE): Promise<string> {
  const cwdAbs = resolve(cwd);
  const cache = resolve(cacheRoot);
  const root = resolve(repoRoot);
  const inside = cwdAbs.startsWith(`${cache}${sep}`);
  if (!inside || cwdAbs === root || cache === root) {
    throw new Error(`refusing to run git in ${cwdAbs}: fixture git must run strictly inside ${cache}, never the repo root ${root}`);
  }
  const result = await execa("git", args, {
    cwd: cwdAbs,
    env: { ...gitEnv(date), GIT_CEILING_DIRECTORIES: cache },
    extendEnv: false,
    reject: false,
  });
  if (result.exitCode !== 0) {
    throw new Error(`git ${args.join(" ")} failed in ${cwdAbs}: ${result.stderr}`);
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
  const cache = opts.cacheDir ?? join(root, ".cache", "fixtures");
  const built: BuiltScenario[] = [];
  const git = (cwd: string, args: string[], date = FIXED_DATE) => runFixtureGit(cache, root, cwd, args, date);

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

    // npm strips .gitignore from tarballs, so make sure a packaged demo never snapshots its node_modules.
    if (!existsSync(join(dest, ".gitignore"))) await writeFile(join(dest, ".gitignore"), "node_modules/\n");
    // In a source checkout the fixtures share the repo's node_modules; a packaged demo installs its own.
    if (existsSync(join(root, "node_modules"))) await symlink(join(root, "node_modules"), join(dest, "node_modules"), "junction");

    await git(dest, ["init", "-q", "-b", "main"]);
    const top = (await git(dest, ["rev-parse", "--show-toplevel"])).trim();
    if ((await realpath(top)) !== (await realpath(dest))) throw new Error(`fixture repo for ${name} resolved to ${top}, expected ${dest}`);
    await git(dest, ["config", "core.autocrlf", "false"]);
    await git(dest, ["config", "core.fileMode", "false"]);
    await git(dest, ["add", "-A"]);
    await git(dest, ["commit", "-q", "-m", "base"]);
    const baseSha = (await git(dest, ["rev-parse", "HEAD"])).trim();

    const apply = async (dir: string) => {
      const overlay = join(dir, "overlay");
      for (const file of await listFiles(overlay).catch(() => [] as string[])) {
        const target = join(dest, relative(overlay, file));
        await mkdir(dirname(target), { recursive: true });
        await cp(file, target);
      }
      try {
        for (const line of (await readFile(join(dir, "delete.txt"), "utf8")).split("\n")) {
          const path = line.trim();
          if (path) await rm(join(dest, path), { force: true });
        }
      } catch {
        // no delete.txt
      }
    };

    // Multi-agent scenarios: one commit per stage (stages/<nn-name>/{overlay,delete.txt,summary.md}).
    const stageNames = (await readdir(join(scenarioDir, "stages")).catch(() => [] as string[])).sort();
    const stageShas: Record<string, string> = {};
    for (const stage of stageNames) {
      await apply(join(scenarioDir, "stages", stage));
      await git(dest, ["add", "-A"]);
      await git(dest, ["commit", "-q", "-m", `stage ${stage}`], FIXED_DATE_AGENT);
      stageShas[stage] = (await git(dest, ["rev-parse", "HEAD"])).trim();
    }
    if (stageNames.length === 0) await apply(scenarioDir);

    const mode = stageNames.length > 0 ? "commit" : (await readFile(join(scenarioDir, "mode.txt"), "utf8")).trim();
    let headSha = stageNames.length > 0 ? (stageShas[stageNames[stageNames.length - 1] as string] as string) : baseSha;
    if (mode === "commit" && stageNames.length === 0) {
      await git(dest, ["add", "-A"]);
      await git(dest, ["commit", "-q", "-m", "agent change"], FIXED_DATE_AGENT);
      headSha = (await git(dest, ["rev-parse", "HEAD"])).trim();
    } else if (mode !== "worktree" && mode !== "commit") {
      throw new Error(`scenario ${name}: unknown mode "${mode}"`);
    }

    await writeFile(
      join(cache, `${name}.json`),
      `${JSON.stringify({ name, baseSha, headSha, mode, ...(stageNames.length > 0 ? { stages: stageShas } : {}) }, null, 2)}\n`,
      "utf8",
    );

    built.push({ name, repoPath: dest, baseSha, headSha, mode: mode as "commit" | "worktree" });
    if (!opts.quiet)
      console.log(`  ${name.padEnd(16)} ${baseSha.slice(0, 7)} → ${headSha.slice(0, 7)} (${mode})`);
  }

  return built;
}

const isDirectRun =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  const only = process.argv.slice(2).filter((arg) => !arg.startsWith("-"));
  const list = only.length > 0 ? only : undefined;
  console.log(`building fixtures${list ? `: ${list.join(", ")}` : ""}`);
  buildFixtures({
    scenarios: list,
    ...(process.env.NOCAP_FIXTURES_ROOT ? { root: process.env.NOCAP_FIXTURES_ROOT } : {}),
    ...(process.env.NOCAP_FIXTURES_CACHE ? { cacheDir: process.env.NOCAP_FIXTURES_CACHE } : {}),
  })
    .then((built) => console.log(`built ${built.length} scenario(s) in .cache/fixtures`))
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    });
}
