import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { verifyLocal } from "../src/adapters/local";

const ROOT = fileURLToPath(new URL("../../..", import.meta.url));
const env = { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "", NOCAP_OFFLINE: "1" };
const git = (cwd: string, ...args: string[]) =>
  execFileSync("git", args, { cwd, encoding: "utf8", env: { PATH: env.PATH, HOME: env.HOME, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t" } });
const put = (root: string, rel: string, text: string) => {
  mkdirSync(dirname(join(root, rel)), { recursive: true });
  writeFileSync(join(root, rel), text);
};

let tmp = "";
async function repo(name: string, files: Record<string, string>, baseFiles: Record<string, string> = {}) {
  const dir = join(tmp, name);
  cpSync(join(ROOT, "fixtures/project"), dir, { recursive: true });
  symlinkSync(join(ROOT, "node_modules"), join(dir, "node_modules"), "junction");
  for (const [p, t] of Object.entries(baseFiles)) put(dir, p, t);
  git(dir, "init", "-q", "-b", "main");
  git(dir, "add", "-A");
  git(dir, "commit", "-q", "-m", "base");
  for (const [p, t] of Object.entries(files)) put(dir, p, t);
  return dir;
}
async function bite(dir: string, summary: string) {
  const { receipt } = await verifyLocal({ repoPath: dir, summary, exec: true, offline: true, save: false }, env);
  const claim = receipt.claims.find((c) => c.claim.type === "tests_added");
  return { claim, bc: claim?.verdict.bitecheck ?? null, receipt };
}

beforeAll(async () => {
  tmp = await mkdtemp(join(tmpdir(), "nocap-stub-"));
});
afterAll(async () => rm(tmp, { recursive: true, force: true }));

const MATH = "export function mul(a: number, b: number): number {\n  return a * b;\n}\n";
const SUMMARY = "Added tests for mul in test/math.test.ts.";

describe("Bitecheck on newly added symbols", () => {
  it("a test asserting only typeof mul === 'function' is TOOTHLESS (stub)", async () => {
    const dir = await repo("typeof", {
      "src/math.ts": MATH,
      "test/math.test.ts": `import { describe, expect, it } from "vitest";\nimport { mul } from "../src/math";\ndescribe("mul", () => {\n  it("mul exists", () => {\n    expect(typeof mul).toBe("function");\n  });\n});\n`,
    });
    const { claim, bc, receipt } = await bite(dir, SUMMARY);
    expect(bc?.outcome).toBe("toothless");
    expect(bc?.mode).toBe("stub");
    expect(bc?.stubbed).toEqual(["src/math.ts › mul"]);
    expect(bc?.deletedForRevert).toEqual([]);
    expect(claim?.verdict.status).toBe("contradicted");
    expect(claim?.verdict.reason).toContain("stubbed");
    // the stubbed file counts as covered by the claim, not as an undisclosed change
    expect(JSON.stringify(receipt.undisclosed)).not.toContain("src/math.ts");
  }, 90_000);

  it("a test asserting mul(2,3) === 6 BITES (stub)", async () => {
    const dir = await repo("value", {
      "src/math.ts": MATH,
      "test/math.test.ts": `import { describe, expect, it } from "vitest";\nimport { mul } from "../src/math";\ndescribe("mul", () => {\n  it("multiplies", () => {\n    expect(mul(2, 3)).toBe(6);\n  });\n});\n`,
    });
    const { claim, bc } = await bite(dir, SUMMARY);
    expect(bc?.outcome).toBe("bites");
    expect(bc?.mode).toBe("stub");
    expect(claim?.verdict.status).toBe("verified");
  }, 90_000);

  it("a function added to an existing file is stubbed in place, and the base file is not reverted over it", async () => {
    const dir = await repo(
      "existing",
      { "src/math.ts": `export function add(a: number, b: number): number {\n  return a + b;\n}\n${MATH}`, "test/math.test.ts": `import { expect, it } from "vitest";\nimport { mul } from "../src/math";\nit("multiplies", () => { expect(mul(4, 5)).toBe(20); });\n` },
      { "src/math.ts": "export function add(a: number, b: number): number {\n  return a + b;\n}\n" },
    );
    const { bc } = await bite(dir, SUMMARY);
    expect(bc).toMatchObject({ outcome: "bites", mode: "stub", stubbed: ["src/math.ts › mul"] });
  }, 90_000);

  it("a modified pre-existing function is put back to its base body alongside the stub", async () => {
    const base = "export function add(a: number, b: number): number {\n  return a + b;\n}\n";
    const dir = await repo(
      "modified",
      {
        // head: add() now also doubles; mul() is new. The test checks add(1,2) === 6, which only holds with the change.
        "src/math.ts": `export function add(a: number, b: number): number {\n  return (a + b) * 2;\n}\n${MATH}`,
        "test/math.test.ts": `import { expect, it } from "vitest";\nimport { add } from "../src/math";\nit("add doubles", () => { expect(add(1, 2)).toBe(6); });\n`,
      },
      { "src/math.ts": base },
    );
    const { bc } = await bite(dir, "Added tests for add in test/math.test.ts.");
    expect(bc?.outcome).toBe("bites");
  }, 90_000);

  it("a change with no new functions still uses the whole-file revert", async () => {
    const dir = await repo("plain", { "src/retry.ts": "export async function withRetry() { return 1; }\n" });
    const { bc } = await bite(dir, "Added tests for retry in test/retry.test.ts.");
    expect(bc?.mode ?? "revert").toBe("revert");
  }, 90_000);
});
