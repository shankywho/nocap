import { join } from "node:path";
import type { FsPort } from "../ports.js";

export interface WorkspacePackage {
  name: string;
  /** Directory relative to the workspace root. */
  dir: string;
  /** True when the package's entry points into built output (`dist/…`), which a fresh checkout does not have. */
  usesDist: boolean;
  /** The built-output entry files named by main/module/exports/types, relative to the package directory. */
  builtEntries: string[];
}

const SKIP_DIRS = new Set([".git", "node_modules", "dist", "build", ".next", ".turbo", "coverage", ".nocap", ".cache", ".venv", "venv"]);

/** Directories that contain a `node_modules`, up to `maxDepth` levels below the root (the root itself is not included). */
export async function findNestedNodeModules(fs: FsPort, root: string, maxDepth = 3, cap = 300): Promise<string[]> {
  const found: string[] = [];
  const walk = async (rel: string, depth: number): Promise<void> => {
    if (depth > maxDepth || found.length >= cap) return;
    const abs = rel ? join(root, rel) : root;
    const entries = await fs.readdir(abs).catch(() => [] as string[]);
    for (const name of entries) {
      if (SKIP_DIRS.has(name) || name.startsWith(".")) continue;
      const childRel = rel ? `${rel}/${name}` : name;
      const stat = await fs.stat(join(root, childRel)).catch(() => null);
      if (!stat?.isDirectory) continue;
      if (await fs.exists(join(root, childRel, "node_modules"))) found.push(childRel);
      await walk(childRel, depth + 1);
    }
  };
  await walk("", 1);
  return found;
}

async function readJson(fs: FsPort, path: string): Promise<Record<string, unknown> | null> {
  try {
    return JSON.parse(await fs.readFile(path)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function workspaceGlobs(pkg: Record<string, unknown> | null, yaml: string | null): string[] {
  const out: string[] = [];
  const ws = pkg?.workspaces;
  if (Array.isArray(ws)) out.push(...ws.filter((w): w is string => typeof w === "string"));
  else if (ws && typeof ws === "object" && Array.isArray((ws as { packages?: unknown }).packages)) out.push(...((ws as { packages: unknown[] }).packages.filter((w): w is string => typeof w === "string")));
  if (yaml) {
    let inPackages = false;
    for (const line of yaml.split("\n")) {
      if (/^packages\s*:/.test(line)) inPackages = true;
      else if (/^\S/.test(line)) inPackages = false;
      else if (inPackages) {
        const m = /^\s*-\s*["']?([^"'#\s]+)["']?/.exec(line);
        if (m?.[1] && !m[1].startsWith("!")) out.push(m[1]);
      }
    }
  }
  return out;
}

const BUILT = /^(?:dist|build|lib|out)\//;
function builtPaths(v: unknown): string[] {
  if (typeof v === "string") {
    const clean = v.replace(/^\.\//, "");
    return BUILT.test(clean) && !clean.includes("*") ? [clean] : [];
  }
  if (Array.isArray(v)) return v.flatMap(builtPaths);
  if (v && typeof v === "object") return Object.values(v).flatMap(builtPaths);
  return [];
}

/** Packages of an npm, yarn or pnpm workspace (simple `dir/*` and `dir/**` globs and literal paths). */
export async function listWorkspacePackages(fs: FsPort, root: string): Promise<WorkspacePackage[]> {
  const rootPkg = await readJson(fs, join(root, "package.json"));
  const yaml = (await fs.exists(join(root, "pnpm-workspace.yaml"))) ? await fs.readFile(join(root, "pnpm-workspace.yaml")).catch(() => null) : null;
  const dirs = new Set<string>();
  for (const glob of workspaceGlobs(rootPkg, yaml)) {
    const clean = glob.replace(/^\.\//, "").replace(/\/$/, "");
    if (/\*\*?$/.test(clean)) {
      const parent = clean.replace(/\/\*+$/, "");
      for (const name of await fs.readdir(join(root, parent)).catch(() => [] as string[])) if (!name.startsWith(".") && name !== "node_modules") dirs.add(`${parent}/${name}`);
    } else if (!clean.includes("*")) dirs.add(clean);
  }
  const out: WorkspacePackage[] = [];
  for (const dir of dirs) {
    const pkg = await readJson(fs, join(root, dir, "package.json"));
    if (!pkg || typeof pkg.name !== "string") continue;
    // `types` is ignored: tests resolve code through main/module/exports.
    const builtEntries = [...new Set([...builtPaths(pkg.main), ...builtPaths(pkg.module), ...builtPaths(pkg.exports)])];
    out.push({ name: pkg.name, dir, usesDist: builtEntries.length > 0, builtEntries });
  }
  return out;
}

/** Workspace packages consumed through built output whose output is not in this checkout (dist/ is normally gitignored). */
export async function packagesMissingBuild(fs: FsPort, root: string, pkgs: WorkspacePackage[]): Promise<WorkspacePackage[]> {
  const missing: WorkspacePackage[] = [];
  for (const p of pkgs) {
    if (!p.usesDist) continue;
    let present = true;
    for (const entry of p.builtEntries) if (!(await fs.exists(join(root, p.dir, entry)))) present = false;
    if (!present) missing.push(p);
  }
  return missing;
}

/** The command that produces build output for the whole workspace, or null when the project has none. */
export async function detectBuildCommand(fs: FsPort, root: string): Promise<{ file: string; args: string[] } | null> {
  const pkg = await readJson(fs, join(root, "package.json"));
  const hasBuild = typeof (pkg?.scripts as Record<string, unknown> | undefined)?.build === "string";
  if ((await fs.exists(join(root, "pnpm-workspace.yaml"))) || (await fs.exists(join(root, "pnpm-lock.yaml")))) return { file: "pnpm", args: ["-r", "build"] };
  if (!hasBuild) return null;
  if (await fs.exists(join(root, "yarn.lock"))) return { file: "yarn", args: ["build"] };
  return { file: "npm", args: ["run", "build"] };
}
