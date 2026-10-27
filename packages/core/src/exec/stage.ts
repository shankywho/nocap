import type { ExecStage } from "../pipeline.js";
import { bitecheck } from "../bitecheck/run.js";
import { createWorktree, type Worktree } from "../git/worktree.js";
import type { ExecPort, FsPort, GitPort } from "../ports.js";
import { detectRunner } from "../runners/detect.js";
import { safeEnv } from "./safeEnv.js";
import { collectedTooFew } from "../runners/classify.js";
import { runTests } from "../runners/run.js";

export interface ExecStageOptions {
  git: GitPort;
  exec: ExecPort;
  fs: FsPort;
  runId: string;
  timeoutMs: number;
  /** Environment for child processes; supplied by the shell, core never reads process.env. */
  env: Record<string, string>;
  testCommand?: string | null;
  testFormat?: "jest" | "junit" | null;
  onBitecheck?: (claimId: string, phase: "head" | "revert" | "rerun", detail: string) => void;
  /** Called when something nocap ran changed the user's dependency tree. Should never happen; it is reported loudly if it does. */
  onWarning?: (message: string) => void;
}

/** Commands a summary may ask us to run. Anything else is reported as not run. */
const SAFE_COMMAND =
  /^(?:(?:pnpm|npm|yarn|bun)(?: run)? (?:test|build|lint|typecheck|check|tsc)(?:[:\w-]*)|(?:npx )?(?:tsc|eslint|prettier|vitest|jest|ruff|mypy|pytest)(?: [\w@./=:-]+)*|cargo (?:build|test|check|clippy)|go (?:build|test|vet)(?: [\w./-]+)*|python -m (?:pytest|mypy|ruff))$/;

export function isSafeCommand(command: string): boolean {
  return SAFE_COMMAND.test(command.trim());
}

export function createExecStage(options: ExecStageOptions): ExecStage {
  // Every child gets the no-install guard, whatever environment the shell supplied (see safeEnv.ts).
  const opts: ExecStageOptions = { ...options, env: safeEnv(options.env) };
  let headTree: Worktree | null = null;
  let guard: { file: string; before: string } | null = null;
  const fingerprint = async (file: string): Promise<string> => {
    const st = await opts.fs.stat(file).catch(() => null);
    return st ? `${st.size}:${st.mtimeMs}` : "absent";
  };
  const head = async (repoRoot: string, headSha: string) => {
    if (!headTree) {
      const file = `${repoRoot}/node_modules/.modules.yaml`;
      guard = { file, before: await fingerprint(file) };
      headTree = await createWorktree({ git: opts.git, fs: opts.fs, repoRoot, ref: headSha, runId: opts.runId });
    }
    return headTree;
  };

  return {
    async runSuite({ repoRoot, headSha, inPlace }) {
      const suite = async (cwd: string) => {
        const runner = opts.testCommand ? "custom" : await detectRunner(opts.fs, cwd);
        if (!runner) return null;
        return runTests({
          exec: opts.exec, fs: opts.fs, cwd, runner, timeoutMs: opts.timeoutMs, env: opts.env,
          customCommand: opts.testCommand ?? null, customFormat: opts.testFormat ?? null,
        });
      };
      // The user's working tree has their installed dependencies and built workspace packages; a fresh checkout does not.
      // Running the project's own runner there changes nothing about the code. Bitecheck is the only user of the worktree.
      if (inPlace) return suite(repoRoot);
      const run = await suite((await head(repoRoot, headSha)).path);
      if (!run || run.environmentError || (run.failed === 0 && run.total > 0)) return run;
      // Failures (or nothing collected) in a bare checkout: compare with what the project collects in place before calling it a failure.
      const reference = await suite(repoRoot);
      if (reference && !reference.environmentError) {
        if (collectedTooFew(run.total, reference.total)) {
          return { ...run, environmentError: `a clean checkout collected ${run.total} tests but the project collects ${reference.total} in place: files or packages are missing, not failing` };
        }
        // Tests that fail in a bare checkout but pass in the working tree depend on files that are not committed
        // (build output, caches, generated fixtures). That is the checkout, not the code: report `!`, never ✗.
        const key = (t: { file: string; fullName: string }) => `${t.file}\u0000${t.fullName}`;
        const failingHere = run.tests.filter((t) => t.status === "failed");
        const failingThere = new Set(reference.tests.filter((t) => t.status === "failed").map(key));
        if (failingHere.length > 0 && run.suiteErrors.length === 0 && failingHere.every((t) => !failingThere.has(key(t)))) {
          return { ...run, environmentError: `${failingHere.length} test${failingHere.length === 1 ? "" : "s"} fail in a clean checkout of ${headSha.slice(0, 7)} but pass in your working tree, so they depend on uncommitted files (build output, caches, generated fixtures), not on the code under review` };
        }
      }
      return run;
    },

    async bitecheck(claim, ctx) {
      return bitecheck({
        claim, changeSet: ctx.changeSet, git: opts.git, exec: opts.exec, fs: opts.fs,
        repoRoot: ctx.repoRoot, baseSha: ctx.baseSha, headSha: ctx.headSha, runId: opts.runId,
        timeoutMs: opts.timeoutMs, env: opts.env, testCommand: opts.testCommand ?? null, testFormat: opts.testFormat ?? null,
        onPhase: (phase, detail) => opts.onBitecheck?.(claim.id, phase, detail),
      });
    },

    async runCommand(command, { repoRoot, headSha }) {
      if (!isSafeCommand(command)) return null;
      const wt = await head(repoRoot, headSha);
      const [file, ...args] = command.trim().split(/\s+/);
      if (!file) return null;
      const started = Date.now();
      const r = await opts.exec.run(file, args, { cwd: wt.path, env: opts.env, timeoutMs: opts.timeoutMs });
      return { exitCode: r.exitCode, durationMs: Date.now() - started, stderrTail: (r.stderr || r.stdout).slice(-2000), command };
    },

    async dispose() {
      await headTree?.remove();
      headTree = null;
      if (guard && (await fingerprint(guard.file)) !== guard.before) {
        opts.onWarning?.(`${guard.file} changed while nocap ran. nocap does not install dependencies; check your node_modules (run your package manager's install if something is missing).`);
      }
      guard = null;
    },
  };
}
