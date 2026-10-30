import type { Node as TsNode, SourceFile } from "ts-morph";

/** ts-morph pulls in the whole TypeScript compiler, so it is loaded only when a stub is actually needed. */
type TsMorph = typeof import("ts-morph");
let loaded: TsMorph | null = null;
async function ensureTs(): Promise<void> {
  loaded ??= await import("ts-morph");
}
const T = (): TsMorph => {
  if (!loaded) throw new Error("ts-morph is not loaded");
  return loaded;
};

const TS_JS = /\.(?:[cm]?[jt]sx?)$/;
const PY = /\.py$/;

export const isStubbable = (path: string): boolean => TS_JS.test(path) || PY.test(path);

/* ── TypeScript / JavaScript (ts-morph) ─────────────────────────────────── */

function load(path: string, text: string): SourceFile {
  const project = new (T().Project)({ useInMemoryFileSystem: true, skipAddingFilesFromTsConfig: true, compilerOptions: { allowJs: true, jsx: 1 } });
  return project.createSourceFile(path, text, { overwrite: true });
}

type Fn = { name: string; node: TsNode };

/** Top-level functions, `const f = () => …` / `function` expressions, and class methods, by qualified name. Declarations without a body are skipped. */
function tsFunctions(sf: SourceFile): Fn[] {
  const { Node } = T();
  const out: Fn[] = [];
  for (const fn of sf.getFunctions()) {
    const name = fn.getName();
    if (name && fn.hasBody()) out.push({ name, node: fn });
  }
  for (const decl of sf.getVariableDeclarations()) {
    const init = decl.getInitializer();
    if (init && (Node.isArrowFunction(init) || Node.isFunctionExpression(init))) out.push({ name: decl.getName(), node: init });
  }
  for (const cls of sf.getClasses()) {
    const cname = cls.getName();
    if (!cname) continue;
    for (const m of cls.getMethods()) if (m.hasBody()) out.push({ name: `${cname}.${m.getName()}`, node: m });
  }
  return out;
}

function stubTsBody(node: TsNode): void {
  const { Node } = T();
  if (Node.isArrowFunction(node)) {
    const body = node.getBody();
    if (Node.isBlock(body)) node.setBodyText("return undefined;");
    else body.replaceWithText("undefined");
    return;
  }
  if (Node.isFunctionDeclaration(node) || Node.isFunctionExpression(node) || Node.isMethodDeclaration(node)) node.setBodyText("return undefined;");
}

/* ── Python (indentation-based) ─────────────────────────────────────────── */

interface PyDef {
  name: string;
  /** Line index of `def`, line index of the last header line (ends with ':'), and the exclusive end of the body. */
  start: number;
  headerEnd: number;
  bodyEnd: number;
  indent: number;
}

function pyDefs(text: string): PyDef[] {
  const lines = text.split("\n");
  const defs: PyDef[] = [];
  const indentOf = (l: string) => l.length - l.trimStart().length;
  const classStack: { name: string; indent: number }[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] as string;
    if (line.trim() === "" || line.trimStart().startsWith("#")) continue;
    const ind = indentOf(line);
    while (classStack.length > 0 && ind <= (classStack[classStack.length - 1] as { indent: number }).indent) classStack.pop();
    const cls = /^\s*class\s+([A-Za-z_]\w*)/.exec(line);
    if (cls) classStack.push({ name: cls[1] as string, indent: ind });
    const m = /^\s*(?:async\s+)?def\s+([A-Za-z_]\w*)\s*\(/.exec(line);
    if (!m) continue;
    let depth = 0;
    let end = i;
    for (let j = i; j < lines.length; j++) {
      const l = (lines[j] as string).replace(/#.*$/, "");
      for (const ch of l) depth += ch === "(" || ch === "[" || ch === "{" ? 1 : ch === ")" || ch === "]" || ch === "}" ? -1 : 0;
      if (depth <= 0 && l.trimEnd().endsWith(":")) {
        end = j;
        break;
      }
    }
    let bodyEnd = end + 1;
    while (bodyEnd < lines.length && ((lines[bodyEnd] as string).trim() === "" || indentOf(lines[bodyEnd] as string) > ind)) bodyEnd++;
    // keep trailing blank lines out of the replaced body
    while (bodyEnd > end + 1 && (lines[bodyEnd - 1] as string).trim() === "") bodyEnd--;
    const owner = classStack.length > 0 && ind > (classStack[classStack.length - 1] as { indent: number }).indent ? `${(classStack[classStack.length - 1] as { name: string }).name}.` : "";
    defs.push({ name: `${owner}${m[1]}`, start: i, headerEnd: end, bodyEnd, indent: ind });
  }
  return defs;
}

function stubPython(text: string, names: Set<string>): string {
  const lines = text.split("\n");
  const defs = pyDefs(text).filter((d) => names.has(d.name)).sort((a, b) => b.start - a.start);
  for (const d of defs) {
    // a nested def inside an already-stubbed body is gone; skip overlaps
    lines.splice(d.headerEnd + 1, d.bodyEnd - (d.headerEnd + 1), `${" ".repeat(d.indent + 4)}return None`);
  }
  return lines.join("\n");
}

/* ── Function-level revert of pre-existing functions ───────────────────── */

interface BodyInfo {
  isExpression: boolean;
  text: string;
}

function tsBodies(sf: SourceFile): Map<string, BodyInfo> {
  const { Node } = T();
  const map = new Map<string, BodyInfo>();
  for (const f of tsFunctions(sf)) {
    const n = f.node;
    if (Node.isArrowFunction(n)) {
      const body = n.getBody();
      map.set(f.name, Node.isBlock(body) ? { isExpression: false, text: n.getBodyText() ?? "" } : { isExpression: true, text: body.getText() });
    } else if (Node.isFunctionDeclaration(n) || Node.isFunctionExpression(n) || Node.isMethodDeclaration(n)) {
      map.set(f.name, { isExpression: false, text: n.getBodyText() ?? "" });
    }
  }
  return map;
}

function revertTsFunction(node: TsNode, base: BodyInfo): void {
  const { Node } = T();
  if (Node.isArrowFunction(node)) {
    const body = node.getBody();
    if (Node.isBlock(body) && !base.isExpression) node.setBodyText(base.text);
    else if (!Node.isBlock(body) && base.isExpression) body.replaceWithText(base.text);
    return;
  }
  if ((Node.isFunctionDeclaration(node) || Node.isFunctionExpression(node) || Node.isMethodDeclaration(node)) && !base.isExpression) node.setBodyText(base.text);
}

function revertPython(baseText: string, headText: string, skip: Set<string>): string {
  const baseLines = baseText.split("\n");
  const baseDefs = new Map(pyDefs(baseText).map((d) => [d.name, d]));
  const lines = headText.split("\n");
  const defs = pyDefs(headText).sort((a, b) => b.start - a.start);
  for (const d of defs) {
    const b = baseDefs.get(d.name);
    if (!b || skip.has(d.name)) continue;
    const headBody = lines.slice(d.headerEnd + 1, d.bodyEnd);
    const baseBody = baseLines.slice(b.headerEnd + 1, b.bodyEnd).map((l) => (b.indent === d.indent ? l : b.indent > d.indent ? l.slice(b.indent - d.indent) : `${" ".repeat(d.indent - b.indent)}${l}`));
    if (headBody.join("\n") !== baseBody.join("\n")) lines.splice(d.headerEnd + 1, headBody.length, ...baseBody);
  }
  return lines.join("\n");
}

/** The Bitecheck mutation for one source file: added functions are stubbed, modified pre-existing functions go back to their base bodies. */
export async function mutateForStub(path: string, baseText: string | null, headText: string, added: string[]): Promise<string> {
  const stubbed = await stubFunctions(path, headText, added);
  if (baseText === null) return stubbed;
  if (PY.test(path)) return revertPython(baseText, stubbed, new Set(added));
  try {
    const sf = load(path, stubbed);
    const base = tsBodies(load(path, baseText));
    const skip = new Set(added);
    for (const f of tsFunctions(sf).sort((a, b) => b.node.getStart() - a.node.getStart())) {
      const b = base.get(f.name);
      if (b && !skip.has(f.name)) revertTsFunction(f.node, b);
    }
    return sf.getFullText();
  } catch {
    return stubbed;
  }
}

/* ── Public API ─────────────────────────────────────────────────────────── */

export async function functionNames(path: string, text: string): Promise<string[]> {
  if (PY.test(path)) return [...new Set(pyDefs(text).map((d) => d.name))];
  if (!TS_JS.test(path)) return [];
  try {
    await ensureTs();
    return [...new Set(tsFunctions(load(path, text)).map((f) => f.name))];
  } catch {
    return [];
  }
}

/** Functions present at head but not at base. A file that is new at base has every function added. */
export async function addedFunctions(path: string, baseText: string | null, headText: string): Promise<string[]> {
  const head = await functionNames(path, headText);
  if (baseText === null) return head;
  const base = new Set(await functionNames(path, baseText));
  return head.filter((n) => !base.has(n));
}

/** Replaces each named function's body with `return undefined` (`return None` in Python). Signatures and exports stay. */
export async function stubFunctions(path: string, headText: string, names: string[]): Promise<string> {
  const wanted = new Set(names);
  if (PY.test(path)) return stubPython(headText, wanted);
  await ensureTs();
  const sf = load(path, headText);
  // Stub inner nodes first so outer replacements do not invalidate them.
  const targets = tsFunctions(sf).filter((f) => wanted.has(f.name));
  for (const t of targets.sort((a, b) => b.node.getStart() - a.node.getStart())) stubTsBody(t.node);
  return sf.getFullText();
}


