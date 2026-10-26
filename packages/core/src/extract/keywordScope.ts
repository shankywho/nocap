import { contentWords, synonymsFor } from "./synonyms.js";

export interface Mapping {
  concept: string;
  globs: string[];
  matchedFiles: string[];
}

function stemsFor(concept: string): string[] {
  const words = contentWords(concept);
  const stems = new Set<string>();
  for (const word of words) {
    stems.add(word);
    for (const synonym of synonymsFor(word)) stems.add(synonym);
  }
  if (stems.size === 0) {
    for (const word of concept.toLowerCase().split(/[^a-z0-9]+/)) {
      if (word.length > 2) stems.add(word);
    }
  }
  return [...stems];
}

function normaliseSegment(segment: string): string {
  return segment.toLowerCase().replace(/[-_.]/g, "");
}

/**
 * Deterministic concept -> globs mapper used offline, as the mock and as the
 * fallback when a model mapping is empty. Only files that exist can match.
 */
export function keywordScope(concept: string, files: string[]): Mapping {
  const stems = stemsFor(concept).map(normaliseSegment);
  const matched = files.filter((file) => {
    const segments = file.toLowerCase().split("/").map(normaliseSegment);
    return segments.some((segment) =>
      stems.some((stem) => stem.length > 2 && segment.includes(stem)),
    );
  });

  const globs = new Set<string>();
  for (const file of matched) {
    const parts = file.split("/");
    const dir = parts.slice(0, -1);
    const lastDir = dir[dir.length - 1];
    if (lastDir && stems.includes(normaliseSegment(lastDir))) {
      globs.add(`${dir.join("/")}/**`);
    } else {
      globs.add(file);
    }
  }

  return { concept, globs: [...globs].sort(), matchedFiles: matched.sort() };
}

/** Files to send the model: keyword hits first, else the shallowest 400. */
export function prefilterFiles(concept: string, files: string[], cap = 400): string[] {
  const stems = stemsFor(concept).map(normaliseSegment);
  const hits = files.filter((file) => {
    const segments = file.toLowerCase().split("/").map(normaliseSegment);
    return segments.some((segment) =>
      stems.some((stem) => stem.length > 2 && segment.includes(stem)),
    );
  });
  const list =
    hits.length > 0 ? hits : [...files].sort((a, b) => a.split("/").length - b.split("/").length);
  return list.slice(0, cap);
}
