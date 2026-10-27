/**
 * Environment for every child process nocap starts in a worktree.
 *
 * Package managers can install dependencies on their own: pnpm 11 runs `pnpm install` before a script when its
 * dependency check says node_modules is stale (and in CI mode it does so without asking). If node_modules is linked to
 * the user's, that install rewrites the USER's dependency tree. So every manager is told not to install, not to use
 * the network, and not to write lockfiles, whatever command the project runs:
 *
 * - pnpm: `pnpm_config_verify_deps_before_run=false` (verified on pnpm 11.17; the `npm_config_` spelling is ignored by pnpm).
 * - npm: `npm_config_offline`, `npm_config_audit`, `npm_config_fund`, `npm_config_update_notifier`, `npm_config_package_lock`
 *   (npm never installs on `run`; these stop a stray `npm install`/`npm ci` from fetching, auditing or writing a lockfile).
 * - yarn (berry): `YARN_ENABLE_NETWORK=0`, `YARN_ENABLE_IMMUTABLE_INSTALLS=true`, `YARN_ENABLE_TELEMETRY=0`
 *   (an install fails instead of changing yarn.lock or fetching). Yarn classic has no equivalent switch; `YARN_ENABLE_*`
 *   is ignored there, and `npm_config_*` is read by it, so offline/no-lockfile still apply.
 * - python: `PYTHONDONTWRITEBYTECODE=1` so a linked `.venv` is not filled with `.pyc` files.
 */
export const NO_INSTALL_ENV = {
  pnpm_config_verify_deps_before_run: "false",
  pnpm_config_offline: "true",
  npm_config_offline: "true",
  npm_config_audit: "false",
  npm_config_fund: "false",
  npm_config_update_notifier: "false",
  npm_config_package_lock: "false",
  YARN_ENABLE_NETWORK: "0",
  YARN_ENABLE_IMMUTABLE_INSTALLS: "true",
  YARN_ENABLE_TELEMETRY: "0",
  PYTHONDONTWRITEBYTECODE: "1",
} as const;

export function safeEnv(env: Record<string, string>): Record<string, string> {
  return { ...env, ...NO_INSTALL_ENV };
}
