/**
 * Paths nocap never looks at, with or without a .gitignore: dependency and build output,
 * caches, nocap's own state and logs. Applied to snapshots and to every ChangeSet.
 */
export const ALWAYS_EXCLUDED_DIRS = ["node_modules", ".venv", "venv", "dist", "build", ".next", ".turbo", "coverage", ".nocap", ".cache"] as const;
export const ALWAYS_EXCLUDED_GLOBS = ["*.log"] as const;

/** Pathspec list for `git add` and `git diff`: everything except the excluded paths, at any depth. */
export function excludePathspecs(): string[] {
  return [
    ".",
    ...ALWAYS_EXCLUDED_DIRS.map((d) => `:(exclude,glob)**/${d}/**`),
    ...ALWAYS_EXCLUDED_GLOBS.map((g) => `:(exclude,glob)**/${g}`),
  ];
}

export function isAlwaysExcluded(path: string): boolean {
  const parts = path.split("/");
  if (parts.slice(0, -1).some((p) => (ALWAYS_EXCLUDED_DIRS as readonly string[]).includes(p))) return true;
  return (parts[parts.length - 1] ?? "").endsWith(".log");
}
