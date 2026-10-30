import { describe, expect, it } from "vitest";
import { addedFunctions, functionNames, stubFunctions } from "../src/bitecheck/stub";

describe("stub: TypeScript / JavaScript", () => {
  const src = [
    "export function mul(a: number, b: number): number {",
    "  return a * b;",
    "}",
    "export const add = (a: number, b: number) => a + b;",
    "export const sub = (a: number, b: number) => { return a - b; };",
    "export const div = function (a: number, b: number) { return a / b; };",
    "export async function load(id: string) { return await fetch(id); }",
    "export class Calc {",
    "  twice(x: number) { return x * 2; }",
    "}",
    "export const PI = 3.14;",
    "",
  ].join("\n");

  it("finds functions, expressions and class methods by name, not constants", () => {
    expect(functionNames("src/m.ts", src).sort()).toEqual(["Calc.twice", "add", "div", "load", "mul", "sub"]);
  });

  it("added = at head, not at base; a new file has everything added", () => {
    const base = "export function mul(a: number, b: number) { return a * b; }\n";
    expect(addedFunctions("src/m.ts", base, src).sort()).toEqual(["Calc.twice", "add", "div", "load", "sub"]);
    expect(addedFunctions("src/m.ts", null, src)).toHaveLength(6);
  });

  it("stubs bodies, keeps signatures and exports, leaves other code alone", () => {
    const out = stubFunctions("src/m.ts", src, ["mul", "add", "Calc.twice"]);
    expect(out).toMatch(/export function mul\(a: number, b: number\): number \{\s*return undefined;\s*\}/);
    expect(out).toContain("export const add = (a: number, b: number) => undefined;");
    expect(out).toMatch(/twice\(x: number\) \{\s*return undefined;\s*\}/);
    expect(out).toContain("return a - b;");
    expect(out).toContain("export const PI = 3.14;");
  });

  it("handles JavaScript files and survives syntax it cannot parse", () => {
    expect(stubFunctions("lib/a.js", "export function f(x) { return x + 1 }\n", ["f"])).toMatch(/return undefined/);
    expect(functionNames("lib/a.ts", "export function (((")).toBeDefined();
  });

  it("ignores unsupported file types", () => {
    expect(functionNames("README.md", "# hi")).toEqual([]);
  });
});

describe("stub: Python", () => {
  const py = [
    "import os",
    "",
    "def mul(a, b):",
    '    """Multiply."""',
    "    return a * b",
    "",
    "def add(",
    "    a,",
    "    b,",
    "):",
    "    total = a + b",
    "    return total",
    "",
    "class Calc:",
    "    def twice(self, x):",
    "        return x * 2",
    "",
    "    def keep(self):",
    "        return 1",
    "",
    "X = 1",
    "",
  ].join("\n");

  it("finds defs, including multi-line headers and methods", () => {
    expect(functionNames("m.py", py).sort()).toEqual(["Calc.keep", "Calc.twice", "add", "mul"]);
  });

  it("replaces the body with `return None`, keeping the header", () => {
    const out = stubFunctions("m.py", py, ["mul", "add", "Calc.twice"]);
    expect(out).toContain("def mul(a, b):\n    return None");
    expect(out).toContain("):\n    return None");
    expect(out).toContain("    def twice(self, x):\n        return None");
    expect(out).toContain("        return 1");
    expect(out).toContain("X = 1");
    expect(out).not.toContain("a * b");
    expect(out).not.toContain("total = a + b");
  });
});
