import { execa } from "execa";
import type { CommandResult, ExecOptions, ExecPort } from "../ports.js";

export const DEFAULT_GIT_TIMEOUT_MS = 30_000;

/**
 * Process-tree-safe subprocess adapter. `shell` is false by default; the only
 * caller allowed to opt in is the user-supplied `--test-cmd` path.
 */
export class ExecaExec implements ExecPort {
  async run(
    file: string,
    args: string[],
    opts: ExecOptions & { shell?: boolean },
  ): Promise<CommandResult> {
    try {
      const result = await execa(file, args, {
        cwd: opts.cwd,
        env: opts.env,
        extendEnv: false,
        timeout: opts.timeoutMs ?? DEFAULT_GIT_TIMEOUT_MS,
        cleanup: true,
        shell: opts.shell ?? false,
        reject: false,
        stripFinalNewline: true,
      });
      return {
        stdout: result.stdout ?? "",
        stderr: result.stderr ?? "",
        exitCode: result.exitCode ?? (result.failed ? 1 : 0),
      };
    } catch (error) {
      const timedOut = error instanceof Error && "timedOut" in error && error.timedOut === true;
      if (timedOut) {
        return {
          stdout: "",
          stderr: `command timed out after ${opts.timeoutMs ?? 0}ms`,
          exitCode: 124,
        };
      }
      return {
        stdout: "",
        stderr: error instanceof Error ? error.message : String(error),
        exitCode: 127,
      };
    }
  }
}
