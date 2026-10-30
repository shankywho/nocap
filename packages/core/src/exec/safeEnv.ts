/**
 * Environment for every child process nocap starts in a worktree whose `node_modules` is linked to the user's.
 * pnpm 11 runs `pnpm install` before a script when its dependency check says node_modules is stale (and in CI mode
 * it does so without asking). Through a symlinked node_modules that install rewrites the USER's dependency tree, so
 * it must never happen: the check is switched off for every child, whatever command the project runs.
 */
export const NO_INSTALL_ENV = { pnpm_config_verify_deps_before_run: "false" } as const;

export function safeEnv(env: Record<string, string>): Record<string, string> {
  return { ...env, ...NO_INSTALL_ENV };
}
