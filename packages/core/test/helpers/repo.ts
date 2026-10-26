import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execa } from "execa";
import { FixedClock, NodeFs, SimpleGitPort } from "@nocap/core/adapters";

export interface TestRepo {
  path: string;
  git: SimpleGitPort;
  fs: NodeFs;
  clock: FixedClock;
  write(relativePath: string, content: string): Promise<void>;
  run(...args: string[]): Promise<string>;
  cleanup(): Promise<void>;
}

const FIXED_DATE = "2026-10-26T13:00:00+05:30";

export async function makeTestRepo(): Promise<TestRepo> {
  const path = await mkdtemp(join(tmpdir(), "nocap-test-"));
  const fs = new NodeFs();
  const git = new SimpleGitPort(path);
  const clock = new FixedClock();

  const run = async (args: string[]) => {
    const result = await execa("git", args, {
      cwd: path,
      env: {
        PATH: process.env.PATH ?? "",
        HOME: process.env.HOME ?? "",
        GIT_AUTHOR_NAME: "nocap test",
        GIT_AUTHOR_EMAIL: "test@nocap.dev",
        GIT_COMMITTER_NAME: "nocap test",
        GIT_COMMITTER_EMAIL: "test@nocap.dev",
        GIT_AUTHOR_DATE: FIXED_DATE,
        GIT_COMMITTER_DATE: FIXED_DATE,
      },
      extendEnv: false,
      reject: false,
    });
    if (result.exitCode !== 0) {
      throw new Error(`git ${args.join(" ")} failed: ${result.stderr}`);
    }
    return result.stdout;
  };

  await run(["init", "-q", "-b", "main"]);
  await run(["config", "user.name", "nocap test"]);
  await run(["config", "user.email", "test@nocap.dev"]);
  await run(["config", "core.autocrlf", "false"]);

  return {
    path,
    git,
    fs,
    clock,
    async write(relativePath: string, content: string) {
      const target = join(path, relativePath);
      await fs.mkdir(target.slice(0, target.lastIndexOf("/")));
      await fs.writeFile(target, content);
    },
    run: (...args: string[]) => run(args),
    async cleanup() {
      await rm(path, { recursive: true, force: true });
    },
  };
}
