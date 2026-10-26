import type { Flag } from "../schema/verdict.js";
import type { ChangeSet } from "../git/types.js";
import { isTestPath } from "../git/classify.js";

const DECL = /(^|[^\w.])(?:it|test)\s*\(|^\s*def test_/gm;

export function countDeclarations(source: string): number {
  return source.match(DECL)?.length ?? 0;
}

export interface CountIntegrityInput {
  changeSet: ChangeSet;
  summary: string;
  readAtBase(path: string): Promise<string | null>;
  readAtHead(path: string): Promise<string | null>;
}

export async function countIntegrity(input: CountIntegrityInput): Promise<{ flag: Flag | null; base: number; head: number }> {
  let base = 0;
  let head = 0;
  for (const file of input.changeSet.files) {
    if (!isTestPath(file.path)) continue;
    if (file.status !== "A") base += countDeclarations((await input.readAtBase(file.previousPath ?? file.path)) ?? "");
    if (file.status !== "D") head += countDeclarations((await input.readAtHead(file.path)) ?? "");
  }
  if (head >= base) return { flag: null, base, head };
  if (/\b(remov|delet|drop)\w*\b[^.\n]*\btests?\b/i.test(input.summary)) return { flag: null, base, head };
  return {
    flag: { rule: "test_count_dropped", severity: "warn", path: "", line: null, detail: `${base} → ${head} test declarations` },
    base,
    head,
  };
}
