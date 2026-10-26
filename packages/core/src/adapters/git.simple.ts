import { simpleGit } from "simple-git";
import type { CommandResult, GitOptions, GitPort } from "../ports.js";
import { DEFAULT_GIT_TIMEOUT_MS } from "./exec.execa.js";

/**
 * All git access goes through `raw()` so we control argv exactly (NUL-delimited
 * output, `-M`, `--` separators) and never parse porcelain meant for humans.
 */
export class SimpleGitPort implements GitPort {
  constructor(private readonly defaultCwd: string) {}

  async raw(args: string[], opts?: GitOptions): Promise<CommandResult> {
    const cwd = opts?.cwd ?? this.defaultCwd;
    const client = simpleGit({
      baseDir: cwd,
      binary: "git",
      maxConcurrentProcesses: 1,
      timeout: { block: opts?.timeoutMs ?? DEFAULT_GIT_TIMEOUT_MS },
    });
    if (opts?.env) {
      client.env(opts.env);
    }
    try {
      const stdout = await client.raw(args);
      return { stdout, stderr: "", exitCode: 0 };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { stdout: "", stderr: message, exitCode: 1 };
    }
  }
}