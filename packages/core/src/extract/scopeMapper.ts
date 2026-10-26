import picomatch from "picomatch";
import { z } from "zod";
import {
  CONFIG_GLOBS_LIST,
  DOCS_GLOBS_LIST,
  LOCK_FILES_LIST,
  TEST_GLOBS_LIST,
} from "../git/classify.js";
import type { LlmPort } from "../ports.js";
import { keywordScope, prefilterFiles } from "./keywordScope.js";
import { buildScopeUser, SCOPE_SCHEMA_NAME, SCOPE_SYSTEM } from "./prompts.js";

export interface ScopeResult {
  concept: string;
  globs: string[];
  matchedFiles: string[];
  source: "llm" | "keyword" | "user";
}

const DEPENDENCY_GLOBS = [
  "package.json",
  "pyproject.toml",
  "requirements.txt",
  "Cargo.toml",
  "go.mod",
  ...LOCK_FILES_LIST,
];

const HARDCODED: Record<string, string[]> = {
  test: TEST_GLOBS_LIST,
  tests: TEST_GLOBS_LIST,
  spec: TEST_GLOBS_LIST,
  specs: TEST_GLOBS_LIST,
  suite: TEST_GLOBS_LIST,
  config: CONFIG_GLOBS_LIST,
  configuration: CONFIG_GLOBS_LIST,
  settings: CONFIG_GLOBS_LIST,
  dependency: DEPENDENCY_GLOBS,
  dependencies: DEPENDENCY_GLOBS,
  deps: DEPENDENCY_GLOBS,
  docs: DOCS_GLOBS_LIST,
  documentation: DOCS_GLOBS_LIST,
  readme: DOCS_GLOBS_LIST,
};

const ScopeOutput = z.object({
  concept: z.string(),
  globs: z.array(z.string()),
  rationale: z.string(),
});

export function expandGlobs(
  globs: string[],
  files: string[],
): { globs: string[]; matchedFiles: string[] } {
  const matched = new Set<string>();
  const kept: string[] = [];
  for (const glob of globs) {
    const isMatch = picomatch(glob, { dot: true });
    const hits = files.filter((file) => isMatch(file));
    if (hits.length === 0) continue;
    kept.push(glob);
    for (const hit of hits) matched.add(hit);
  }
  return { globs: [...new Set(kept)].sort(), matchedFiles: [...matched].sort() };
}

export interface MapScopeOptions {
  concept: string;
  files: string[];
  overrides?: Record<string, string[]>;
  llm?: LlmPort | null;
}

export async function mapScope(opts: MapScopeOptions): Promise<ScopeResult> {
  const concept = opts.concept.trim();
  const key = concept.toLowerCase();
  const overrides = opts.overrides ?? {};

  const userGlobs = overrides[key] ?? overrides[concept];
  if (userGlobs) {
    const expanded = expandGlobs(userGlobs, opts.files);
    return { concept, ...expanded, source: "user" };
  }

  const hardcoded = HARDCODED[key];
  if (hardcoded) {
    const expanded = expandGlobs(hardcoded, opts.files);
    return { concept, ...expanded, source: "keyword" };
  }

  if (opts.llm) {
    try {
      const { data } = await opts.llm.json({
        system: SCOPE_SYSTEM,
        user: buildScopeUser(concept, prefilterFiles(concept, opts.files)),
        schemaName: SCOPE_SCHEMA_NAME,
        schema: ScopeOutput,
        maxTokens: 500,
      });
      const expanded = expandGlobs(data.globs, opts.files);
      if (expanded.globs.length > 0) {
        return { concept, ...expanded, source: "llm" };
      }
    } catch {
      // fall through to the deterministic mapper
    }
  }

  const keyword = keywordScope(concept, opts.files);
  return { ...keyword, concept, source: "keyword" };
}
