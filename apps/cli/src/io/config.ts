import { readFile } from "node:fs/promises";
import { join } from "node:path";

export interface Rc {
  scope: Record<string, string[]>;
  roleScopes: Record<string, string[]>;
  testCommand: string | null;
  testFormat: "jest" | "junit" | null;
}

const EMPTY: Rc = { scope: {}, roleScopes: {}, testCommand: null, testFormat: null };

function globMap(value: unknown, field: string): Record<string, string[]> {
  if (value === undefined) return {};
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error(`${field} must be an object of string arrays`);
  const out: Record<string, string[]> = {};
  for (const [key, list] of Object.entries(value)) {
    if (!Array.isArray(list) || list.some((g) => typeof g !== "string")) throw new Error(`${field}.${key} must be an array of strings`);
    out[key.toLowerCase()] = list as string[];
  }
  return out;
}

export async function loadRc(repoPath: string): Promise<Rc> {
  let raw: string;
  try {
    raw = await readFile(join(repoPath, ".nocaprc.json"), "utf8");
  } catch {
    return EMPTY;
  }
  try {
    const data = JSON.parse(raw) as Record<string, unknown>;
    const format = data.testFormat;
    if (format !== undefined && format !== null && format !== "jest" && format !== "junit") throw new Error("testFormat must be jest or junit");
    if (data.testCommand !== undefined && data.testCommand !== null && typeof data.testCommand !== "string") throw new Error("testCommand must be a string");
    return {
      scope: globMap(data.scope, "scope"),
      roleScopes: globMap(data.roleScopes, "roleScopes"),
      testCommand: (data.testCommand as string | null | undefined) ?? null,
      testFormat: (format as "jest" | "junit" | null | undefined) ?? null,
    };
  } catch (error) {
    throw new Error(`invalid .nocaprc.json: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/** `--scope auth=src/auth/**,lib/auth/**` (repeatable) -> { auth: [globs] } */
export function parseScopeFlags(values: string[]): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const value of values) {
    const at = value.indexOf("=");
    if (at <= 0) throw new Error(`--scope expects concept=glob,glob (got '${value}')`);
    out[value.slice(0, at).trim().toLowerCase()] = value.slice(at + 1).split(",").map((g) => g.trim()).filter(Boolean);
  }
  return out;
}

export function envFlag(value: string | undefined): boolean {
  return value === "1" || value === "true";
}
