import type { z } from "zod";

/**
 * Every external dependency of the engine sits behind one of these ports.
 * `packages/core` never touches `process.env`, the filesystem, git or the network
 * directly; a real adapter or a deterministic mock supplies each port.
 */

export interface CommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface ExecOptions {
  cwd: string;
  env?: Record<string, string>;
  timeoutMs?: number;
}

export interface ExecPort {
  /**
   * Run a command without a shell. Rejects only when the process cannot be
   * spawned or times out; a non-zero exit code is returned in the result.
   * `shell` is opt-in for user-provided `--test-cmd` strings only.
   */
  run(
    file: string,
    args: string[],
    opts: ExecOptions & { shell?: boolean },
  ): Promise<CommandResult>;
}

export interface GitOptions {
  cwd?: string;
  env?: Record<string, string>;
  timeoutMs?: number;
}

export interface GitPort {
  /** Run `git <args>` via a raw subprocess. Never throws on a non-zero exit. */
  raw(args: string[], opts?: GitOptions): Promise<CommandResult>;
}

export interface FileStat {
  size: number;
  isFile: boolean;
  isDirectory: boolean;
  mtimeMs: number;
}

export interface FsPort {
  readFile(path: string): Promise<string>;
  writeFile(path: string, content: string): Promise<void>;
  appendFile(path: string, content: string): Promise<void>;
  exists(path: string): Promise<boolean>;
  mkdir(path: string): Promise<void>;
  readdir(path: string): Promise<string[]>;
  rm(path: string, opts?: { recursive?: boolean; force?: boolean }): Promise<void>;
  copyFile(from: string, to: string): Promise<void>;
  symlink(from: string, to: string): Promise<void>;
  stat(path: string): Promise<FileStat>;
  realpath(path: string): Promise<string>;
  /** Create a unique directory under the OS temp dir. */
  mkdtemp(prefix: string): Promise<string>;
  tmpdir(): string;
}

export interface LlmPort {
  json<T>(args: {
    system: string;
    user: string;
    schemaName: string;
    schema: z.ZodType<T>;
    maxTokens?: number;
  }): Promise<{ data: T; provider: string; model: string }>;
}

export interface GithubPrMeta {
  owner: string;
  repo: string;
  number: number;
  title: string;
  body: string;
  baseSha: string;
  headSha: string;
}

export type GithubFileStatus = "added" | "removed" | "modified" | "renamed" | "copied" | "changed";

export interface GithubFile {
  filename: string;
  status: GithubFileStatus;
  additions: number;
  deletions: number;
  patch?: string | null;
  previousFilename?: string | null;
}

export interface GithubCheckRuns {
  total: number;
  runs: { name: string; status: string; conclusion: string | null }[];
}

export interface GithubStatus {
  state: "success" | "pending" | "failure" | "error";
  statuses: { context: string; state: string }[];
}

export interface GithubTree {
  truncated: boolean;
  paths: string[];
}

export interface GithubPort {
  getPullRequest(owner: string, repo: string, number: number): Promise<GithubPrMeta>;
  listPullRequestFiles(owner: string, repo: string, number: number): Promise<GithubFile[]>;
  listCheckRuns(owner: string, repo: string, ref: string): Promise<GithubCheckRuns>;
  getCombinedStatus(owner: string, repo: string, ref: string): Promise<GithubStatus>;
  getTree(owner: string, repo: string, ref: string): Promise<GithubTree>;
}

export interface ClockPort {
  now(): number;
  iso(): string;
}

export interface LoggerPort {
  debug(message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
}

/** Runtime switches assembled by a shell (CLI, web, MCP) and passed into the engine. */
export interface VerifyConfig {
  repoPath: string;
  exec: boolean;
  offline: boolean;
  actor: string;
  model: string | null;
  role: string | null;
  agent: string;
  testTimeoutMs: number;
  scopeOverrides: Record<string, string[]>;
  roleScopes: Record<string, string[]>;
  userScope: Record<string, string[]>;
  alan: { taskId: string | null; sessionId: string | null } | null;
  testCommand: string | null;
  testFormat: "jest" | "junit" | null;
}

export interface VerifyDeps {
  git: GitPort;
  exec: ExecPort;
  fs: FsPort;
  llm: LlmPort;
  clock: ClockPort;
  logger: LoggerPort;
}
