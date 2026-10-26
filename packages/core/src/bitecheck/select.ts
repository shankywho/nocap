import type { Claim } from "../schema/claim.js";
import type { ChangeSet } from "../git/types.js";
import { isTestPath } from "../git/classify.js";

export interface ParsedTest {
  title: string;
  fullName: string;
  startLine: number;
  endLine: number;
}

export interface SelectedTest {
  file: string;
  title: string;
  fullName: string;
  score: number;
}

const JS_CALL = /\b(describe|it|test)(?:\.\w+)*\s*\(\s*(['"`])((?:\\.|(?!\2).)*)\2/;

/** Parses describe/it/test calls (nested describe -> full name) and Python `def test_*`. */
export function parseTests(source: string, path: string): ParsedTest[] {
  const lines = source.split("\n");
  if (path.endsWith(".py")) return parsePython(lines);
  const out: ParsedTest[] = [];
  const stack: { title: string; depth: number }[] = [];
  const open: { index: number; depth: number }[] = [];
  let depth = 0;
  lines.forEach((line, i) => {
    const call = JS_CALL.exec(line);
    if (call?.[1] && call[3] !== undefined) {
      if (call[1] === "describe") {
        stack.push({ title: call[3], depth });
      } else {
        const fullName = [...stack.map((s) => s.title), call[3]].join(" ");
        out.push({ title: call[3], fullName, startLine: i + 1, endLine: i + 1 });
        open.push({ index: out.length - 1, depth });
      }
    }
    for (const ch of line) {
      if (ch === "{") depth++;
      else if (ch === "}") {
        depth--;
        while (stack.length > 0 && stack[stack.length - 1] && (stack[stack.length - 1] as { depth: number }).depth >= depth) stack.pop();
        for (const o of open) {
          if (o.depth >= depth) {
            const t = out[o.index];
            if (t && t.endLine === t.startLine) t.endLine = i + 1;
          }
        }
      }
    }
    // one-line tests close on the same line
    for (let k = open.length - 1; k >= 0; k--) {
      const o = open[k];
      if (o && depth <= o.depth) open.splice(k, 1);
    }
  });
  return out;
}

function parsePython(lines: string[]): ParsedTest[] {
  const out: ParsedTest[] = [];
  lines.forEach((line, i) => {
    const m = /^(\s*)def (test_\w+)/.exec(line);
    if (!m?.[2]) return;
    const indent = (m[1] ?? "").length;
    let end = i + 1;
    for (let j = i + 1; j < lines.length; j++) {
      const l = lines[j] ?? "";
      if (l.trim() !== "" && l.length - l.trimStart().length <= indent) break;
      end = j + 1;
    }
    out.push({ title: m[2], fullName: m[2], startLine: i + 1, endLine: end });
  });
  return out;
}

export interface SelectInput {
  claim: Claim;
  changeSet: ChangeSet;
  readHead(path: string): Promise<string | null>;
  readBase(path: string): Promise<string | null>;
}

/** Only tests the agent added or touched are candidates; pre-existing tests are never reported as toothless. */
export async function selectTests(input: SelectInput): Promise<SelectedTest[]> {
  const { claim, changeSet } = input;
  const keywords = claim.keywords.map((k) => k.toLowerCase());
  const candidates: { file: string; test: ParsedTest; inAddedFile: boolean }[] = [];

  for (const file of changeSet.files) {
    if (!isTestPath(file.path) || file.status === "D") continue;
    const head = await input.readHead(file.path);
    if (head === null) continue;
    const headTests = parseTests(head, file.path);
    const baseSource = file.status === "A" ? null : await input.readBase(file.previousPath ?? file.path);
    const baseNames = new Set(baseSource ? parseTests(baseSource, file.path).map((t) => t.fullName) : []);
    const added = new Set(
      changeSet.hunks.filter((h) => h.path === file.path).flatMap((h) => h.lines.filter((l) => l.type === "add" && l.newLine !== null).map((l) => l.newLine as number)),
    );
    for (const test of headTests) {
      let touched = !baseNames.has(test.fullName);
      for (let n = test.startLine; !touched && n <= test.endLine; n++) if (added.has(n)) touched = true;
      if (touched) candidates.push({ file: file.path, test, inAddedFile: file.status === "A" });
    }
  }

  const score = (c: { file: string; test: ParsedTest }) => {
    let s = claim.paths.some((p) => c.file === p || c.file.endsWith(`/${p}`) || p.endsWith(`/${c.file}`)) ? 3 : 0;
    const pathLower = c.file.toLowerCase();
    const titleLower = c.test.fullName.toLowerCase();
    for (const k of keywords) {
      if (pathLower.includes(k)) s += 2;
      if (titleLower.includes(k)) s += 1;
    }
    return s;
  };

  let chosen = candidates.map((c) => ({ c, s: score(c) })).filter((x) => x.s >= 2);
  if (chosen.length === 0) {
    chosen = candidates
      .filter((c) => c.inAddedFile && keywords.some((k) => c.file.toLowerCase().includes(k)))
      .map((c) => ({ c, s: score(c) }));
  }
  return chosen.map(({ c, s }) => ({ file: c.file, title: c.test.title, fullName: c.test.fullName, score: s }));
}
