/**
 * Marks which characters of a source file are code and which are inside string literals, template literals or
 * comments (and regex literals), so tamper rules do not fire on text that merely mentions `.skip(` or `exclude`.
 * Per line, a string the same length as the line: `c` = code, `s` = literal or comment.
 */
export type LineMask = string;

const TS_JS = /\.(?:[cm]?[jt]sx?)$/;
const PY = /\.py$/;

export const canMask = (path: string): boolean => TS_JS.test(path) || PY.test(path);

const REGEX_PREV = /[=(,:[!&|?{};+\-*%<>~^]/;

function maskJs(text: string): LineMask[] {
  const lines = text.split("\n");
  const out: LineMask[] = [];
  // Stack of open template literals; each entry is the `${}` brace depth inside it (-1 = in the template text).
  let templates: number[] = [];
  let blockComment = false;
  for (const line of lines) {
    const m: string[] = new Array(line.length).fill("c");
    let i = 0;
    let prevCode = "";
    const markStr = (from: number, to: number) => {
      for (let k = from; k < Math.min(to, line.length); k++) m[k] = "s";
    };
    while (i < line.length) {
      const ch = line[i] as string;
      const inTemplateText = templates.length > 0 && templates[templates.length - 1] === -1;
      if (blockComment) {
        const end = line.indexOf("*/", i);
        const stop = end === -1 ? line.length : end + 2;
        markStr(i, stop);
        i = stop;
        if (end !== -1) blockComment = false;
        continue;
      }
      if (inTemplateText) {
        if (ch === "\\") {
          markStr(i, i + 2);
          i += 2;
        } else if (ch === "`") {
          markStr(i, i + 1);
          templates.pop();
          i++;
          prevCode = "`";
        } else if (ch === "$" && line[i + 1] === "{") {
          markStr(i, i + 2);
          templates[templates.length - 1] = 0;
          i += 2;
        } else {
          m[i] = "s";
          i++;
        }
        continue;
      }
      // code (possibly inside `${ ... }` of a template)
      if (ch === "/" && line[i + 1] === "/") {
        markStr(i, line.length);
        break;
      }
      if (ch === "/" && line[i + 1] === "*") {
        blockComment = true;
        markStr(i, i + 2);
        i += 2;
        continue;
      }
      if (ch === "'" || ch === '"') {
        let j = i + 1;
        while (j < line.length && line[j] !== ch) j += line[j] === "\\" ? 2 : 1;
        markStr(i, j + 1);
        i = j + 1;
        prevCode = ch;
        continue;
      }
      if (ch === "`") {
        templates.push(-1);
        markStr(i, i + 1);
        i++;
        continue;
      }
      if (ch === "/" && (prevCode === "" || REGEX_PREV.test(prevCode) || /\b(?:return|typeof|case|in|of)$/.test(line.slice(0, i).trimEnd()))) {
        let j = i + 1;
        let inClass = false;
        while (j < line.length && (inClass || line[j] !== "/")) {
          if (line[j] === "\\") j++;
          else if (line[j] === "[") inClass = true;
          else if (line[j] === "]") inClass = false;
          j++;
        }
        if (j < line.length) {
          markStr(i, j + 1);
          i = j + 1;
          prevCode = "/";
          continue;
        }
      }
      if (templates.length > 0) {
        if (ch === "{") templates[templates.length - 1] = (templates[templates.length - 1] as number) + 1;
        if (ch === "}") {
          const depth = (templates[templates.length - 1] as number) - 1;
          if (depth < 0) {
            // closes the `${`: back to template text
            templates[templates.length - 1] = -1;
            markStr(i, i + 1);
            i++;
            continue;
          }
          templates[templates.length - 1] = depth;
        }
      }
      if (!/\s/.test(ch)) prevCode = ch;
      i++;
    }
    out.push(m.join(""));
  }
  templates = [];
  return out;
}

function maskPy(text: string): LineMask[] {
  const lines = text.split("\n");
  const out: LineMask[] = [];
  let triple: string | null = null;
  for (const line of lines) {
    const m: string[] = new Array(line.length).fill("c");
    let i = 0;
    while (i < line.length) {
      if (triple) {
        const end = line.indexOf(triple, i);
        const stop = end === -1 ? line.length : end + 3;
        for (let k = i; k < stop; k++) m[k] = "s";
        i = stop;
        if (end !== -1) triple = null;
        continue;
      }
      const ch = line[i] as string;
      if (ch === "#") {
        for (let k = i; k < line.length; k++) m[k] = "s";
        break;
      }
      if (ch === '"' || ch === "'") {
        if (line.startsWith(ch.repeat(3), i)) {
          triple = ch.repeat(3);
          for (let k = i; k < i + 3; k++) m[k] = "s";
          i += 3;
          continue;
        }
        let j = i + 1;
        while (j < line.length && line[j] !== ch) j += line[j] === "\\" ? 2 : 1;
        for (let k = i; k <= Math.min(j, line.length - 1); k++) m[k] = "s";
        i = j + 1;
        continue;
      }
      i++;
    }
    out.push(m.join(""));
  }
  return out;
}

/** Per-line masks for a file, or null when the language is not supported (no masking). */
export function maskFile(path: string, text: string): LineMask[] | null {
  if (TS_JS.test(path)) return maskJs(text);
  if (PY.test(path)) return maskPy(text);
  return null;
}

/** True when some match of `re` in `line` starts at a code character, not inside a literal or comment. */
export function matchesInCode(re: RegExp, line: string, mask: LineMask | undefined): boolean {
  if (!mask) return re.test(line);
  const g = new RegExp(re.source, re.flags.includes("g") ? re.flags : `${re.flags}g`);
  for (const m of line.matchAll(g)) if (mask[m.index ?? 0] === "c") return true;
  return false;
}

/** Number of matches of `re` that start in code. */
export function countInCode(re: RegExp, line: string, mask: LineMask | undefined): number {
  const g = new RegExp(re.source, re.flags.includes("g") ? re.flags : `${re.flags}g`);
  let n = 0;
  for (const m of line.matchAll(g)) if (!mask || mask[m.index ?? 0] === "c") n++;
  return n;
}

export interface TamperMasks {
  head: Map<string, LineMask[]>;
  base: Map<string, LineMask[]>;
}

const MAX_MASK_BYTES = 400_000;

/** Masks for every supported file that has hunks, read from the head and base revisions. */
export async function buildMasks(
  paths: string[],
  readHead: (path: string) => Promise<string | null>,
  readBase: (path: string) => Promise<string | null>,
): Promise<TamperMasks> {
  const masks: TamperMasks = { head: new Map(), base: new Map() };
  for (const path of [...new Set(paths)].filter(canMask)) {
    const [head, base] = await Promise.all([readHead(path), readBase(path)]);
    if (head !== null && head.length <= MAX_MASK_BYTES) {
      const m = maskFile(path, head);
      if (m) masks.head.set(path, m);
    }
    if (base !== null && base.length <= MAX_MASK_BYTES) {
      const m = maskFile(path, base);
      if (m) masks.base.set(path, m);
    }
  }
  return masks;
}
