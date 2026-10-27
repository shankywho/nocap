import type { ExecPort, FsPort, GitPort } from "../ports.js";
import type { Claim } from "../schema/claim.js";
import type { Evidence } from "../schema/evidence.js";
import type { BitecheckResult } from "../schema/verdict.js";
import type { ChangeSet } from "../git/types.js";
import { isConfigPath, isDocsPath, isLockPath, isTestPath } from "../git/classify.js";
import { safeEnv } from "../exec/safeEnv.js";
import { createWorktree } from "../git/worktree.js";
import { detectBuildCommand, importedWorkspaceNames, listWorkspacePackages, packagesMissingBuild } from "../git/workspace.js";
import { detectRunner } from "../runners/detect.js";
import { escapeRegex, runTests } from "../runners/run.js";
import type { TestRunResult } from "../runners/types.js";
import { selectTests, type SelectedTest } from "./select.js";
import { addedFunctions, isStubbable, mutateForStub } from "./stub.js";

export interface BitecheckOptions {
  claim: Claim;
  changeSet: ChangeSet;
  git: GitPort;
  exec: ExecPort;
  fs: FsPort;
  repoRoot: string;
  baseSha: string;
  headSha: string;
  runId: string;
  timeoutMs: number;
  env: Record<string, string>;
  testCommand?: string | null;
  testFormat?: "jest" | "junit" | null;
  onPhase?: (phase: "head" | "revert" | "rerun", detail: string) => void;
}

const IMPORT_ERROR = /Cannot find module|Failed to resolve import|Failed to load url|ModuleNotFoundError|ImportError|is not a function|is not defined|does not provide an export|No known conditions/i;

function result(
  outcome: BitecheckResult["outcome"],
  selected: SelectedTest[],
  extra: Partial<BitecheckResult> = {},
): BitecheckResult {
  return {
    outcome,
    mode: "revert",
    stubbed: [],
    selectedTests: selected.map((t) => ({ file: t.file, title: t.title })),
    revertedFiles: [],
    deletedForRevert: [],
    head: null,
    reverted: null,
    ...extra,
  };
}

function evidence(label: "head" | "reverted", run: TestRunResult, selected: SelectedTest[]): Evidence {
  const mine = pick(run, selected);
  return {
    kind: "testRun",
    label,
    runner: run.runner,
    total: mine.length + (mine.length === 0 ? run.suiteErrors.length : 0),
    passed: mine.filter((t) => t.status === "passed").length,
    failed: mine.filter((t) => t.status === "failed").length + (mine.length === 0 ? run.suiteErrors.length : 0),
    skipped: mine.filter((t) => t.status === "skipped").length,
    durationMs: run.durationMs,
    tests: mine.slice(0, 50).map((t) => ({ file: t.file, title: t.title, status: t.status })),
  };
}

function pick(run: TestRunResult, selected: SelectedTest[]) {
  return run.tests.filter((t) => selected.some((s) => s.file === t.file && (t.fullName === s.fullName || t.title === s.title)));
}

export async function bitecheck(options: BitecheckOptions): Promise<BitecheckResult> {
  const opts: BitecheckOptions = { ...options, env: safeEnv(options.env) };
  const { changeSet } = opts;
  const readAt = async (sha: string, path: string) => {
    const r = await opts.git.raw(["show", `${sha}:${path}`], { cwd: opts.repoRoot });
    return r.exitCode === 0 ? r.stdout : null;
  };
  const selected = await selectTests({
    claim: opts.claim,
    changeSet,
    readHead: (p) => readAt(opts.headSha, p),
    readBase: (p) => readAt(opts.baseSha, p),
  });
  if (selected.length === 0) return result("no_matching_tests", selected);

  const sourceFiles = changeSet.files.filter(
    (f) => !isTestPath(f.path) && !isConfigPath(f.path) && !isLockPath(f.path) && !isDocsPath(f.path),
  );
  if (sourceFiles.length === 0) return result("environment", selected);

  const wt = await createWorktree({ git: opts.git, fs: opts.fs, repoRoot: opts.repoRoot, ref: opts.headSha, runId: opts.runId });
  try {
    const runner = opts.testCommand ? "custom" : await detectRunner(opts.fs, wt.path);
    if (!runner) return result("environment", selected);
    const files = [...new Set(selected.map((t) => t.file))];
    const titles = selected.map((t) => escapeRegex(t.title));
    const common = {
      exec: opts.exec, fs: opts.fs, cwd: wt.path, runner, files, titles, timeoutMs: opts.timeoutMs, env: opts.env,
      customCommand: opts.testCommand ?? null, customFormat: opts.testFormat ?? null,
    };

    // A workspace package that tests reach through its built output (dist/) has no output in a fresh checkout, and the
    // output must be rebuilt after the revert: stale output would hide a toothless test. If it cannot be built the
    // result is `environment`, never a verdict.
    let build: { file: string; args: string[] } | null = null;
    const missingBuild = await packagesMissingBuild(opts.fs, wt.path, await listWorkspacePackages(opts.fs, wt.path));
    // Only when the selected tests (through their relative imports) actually reach such a package.
    const needed = missingBuild.length > 0 ? await importedWorkspaceNames(opts.fs, wt.path, files, missingBuild.map((p) => p.name)) : new Set<string>();
    if (needed.size > 0) {
      build = await detectBuildCommand(opts.fs, wt.path);
      if (!build) return result("environment", selected);
    }
    const rebuild = async (): Promise<boolean> => {
      if (!build) return true;
      const r = await opts.exec.run(build.file, build.args, { cwd: wt.path, env: opts.env, timeoutMs: opts.timeoutMs });
      return r.exitCode === 0;
    };
    if (!(await rebuild())) return result("environment", selected);

    opts.onPhase?.("head", `${selected.length} test(s) in ${files.join(", ")}`);
    const head = await runTests(common);
    if (head.environmentError) return result("environment", selected);
    const headEv = evidence("head", head, selected);
    const onHead = pick(head, selected);
    if (onHead.length === 0 || onHead.some((t) => t.status === "failed")) {
      return result(onHead.length === 0 ? "environment" : "broken_on_head", selected, { head: headEv });
    }

    // Functions the change added cannot be "reverted" by checking out base: deleting them fails any test with an import error.
    // Keep their signatures, stub their bodies, and put modified pre-existing functions back to their base bodies.
    const stubPlan = new Map<string, { names: string[]; base: string | null; head: string }>();
    for (const f of sourceFiles) {
      if ((f.status !== "A" && f.status !== "M") || !isStubbable(f.path)) continue;
      const headText = await readAt(opts.headSha, f.path);
      if (headText === null) continue;
      const baseText = f.status === "A" ? null : await readAt(opts.baseSha, f.previousPath ?? f.path);
      if (f.status === "M" && baseText === null) continue;
      const names = await addedFunctions(f.path, baseText, headText);
      if (names.length > 0) stubPlan.set(f.path, { names, base: baseText, head: headText });
    }
    const stubMode = stubPlan.size > 0;
    const rest = sourceFiles.filter((f) => !stubPlan.has(f.path));
    const revertTargets = rest.filter((f) => f.status !== "A").map((f) => f.previousPath ?? f.path);
    const toDelete = rest.filter((f) => f.status === "A" || f.status === "R").map((f) => f.path);
    const stubbed = [...stubPlan].flatMap(([path, p]) => p.names.map((n) => `${path} › ${n}`));
    opts.onPhase?.("revert", stubMode ? `stubbing ${stubbed.length} added function(s) in ${stubPlan.size} file(s)` : `reverting ${revertTargets.length + toDelete.length} source file(s)`);
    if (revertTargets.length > 0) {
      const co = await opts.git.raw(["checkout", opts.baseSha, "--", ...revertTargets], { cwd: wt.path });
      if (co.exitCode !== 0) return result("environment", selected, { head: headEv });
    }
    for (const p of toDelete) await opts.fs.rm(`${wt.path}/${p}`, { force: true });
    for (const [path, p] of stubPlan) await opts.fs.writeFile(`${wt.path}/${path}`, await mutateForStub(path, p.base, p.head, p.names));
    const revertedFiles = revertTargets;
    const deletedForRevert = toDelete;

    if (!(await rebuild())) return result("environment", selected, { head: headEv, revertedFiles, deletedForRevert, ...(stubMode ? { mode: "stub" as const, stubbed } : {}) });
    opts.onPhase?.("rerun", "re-running the selected tests against the reverted source");
    const re = await runTests({ ...common, classifyEnvironment: false });
    if (re.environmentError) return result("environment", selected, { head: headEv, revertedFiles, deletedForRevert });
    const reEv = evidence("reverted", re, selected);
    const onRe = pick(re, selected);
    const fields = { head: headEv, reverted: reEv, revertedFiles, deletedForRevert, ...(stubMode ? { mode: "stub" as const, stubbed } : {}) };

    if (onRe.length === 0 && stubMode) return result("environment", selected, fields);
    if (onRe.length === 0) {
      const fileErrors = re.suiteErrors.filter((e) => files.includes(e.file));
      if (fileErrors.length > 0 && fileErrors.every((e) => IMPORT_ERROR.test(e.message))) return result("import_only", selected, fields);
      return result("environment", selected, fields);
    }
    const failed = onRe.filter((t) => t.status === "failed");
    if (failed.length === 0) return result("toothless", selected, fields);
    if (!stubMode && failed.length === onRe.length && failed.every((t) => IMPORT_ERROR.test(t.message ?? ""))) {
      return result("import_only", selected, fields);
    }
    return result("bites", selected, fields);
  } finally {
    await wt.remove();
  }
}
