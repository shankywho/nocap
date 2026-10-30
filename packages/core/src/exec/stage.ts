import type { ExecStage } from "../pipeline.js";
import { bitecheck } from "../bitecheck/run.js";
import { createWorktree, type Worktree } from "../git/worktree.js";
import type { ExecPort, FsPort, GitPort } from "../ports.js";
import { detectRunner } from "../runners/detect.js";
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
}

/** Commands a summary may ask us to run. Anything else is reported as not run. */
const SAFE_COMMAND =
  /^(?:(?:pnpm|npm|yarn|bun)(?: run)? (?:test|build|lint|typecheck|check|tsc)(?:[:\w-]*)|(?:npx )?(?:tsc|eslint|prettier|vitest|jest|ruff|mypy|pytest)(?: [\w@./=:-]+)*|cargo (?:build|test|check|clippy)|go (?:build|test|vet)(?: [\w./-]+)*|python -m (?:pytest|mypy|ruff))$/;

export function isSafeCommand(command: string): boolean {
  return SAFE_COMMAND.test(command.trim());
}

export function createExecStage(opts: ExecStageOptions): ExecStage {
  let headTree: Worktree | null = null;
  const head = async (repoRoot: string, headSha: string) => {
    headTree ??= await createWorktree({ git: opts.git, fs: opts.fs, repoRoot, ref: headSha, runId: opts.runId });
    return headTree;
  };

  return {
    async runSuite({ repoRoot, headSha }) {
      const wt = await head(repoRoot, headSha);
      const runner = opts.testCommand ? "custom" : await detectRunner(opts.fs, wt.path);
      if (!runner) return null;
      return runTests({
        exec: opts.exec, fs: opts.fs, cwd: wt.path, runner, timeoutMs: opts.timeoutMs, env: opts.env,
        customCommand: opts.testCommand ?? null, customFormat: opts.testFormat ?? null,
      });
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
    },
  };
}
