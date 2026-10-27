import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { verifyLocal } from "../src/adapters/local";
import { extractClaims } from "../src/extract/regexExtractor";
import type { ChangedFile, ChangeSet, DiffHunk } from "../src/git/types";
import type { Claim } from "../src/schema/claim";
import { isGoldenPath } from "../src/verifiers/housekeeping";
import { verifyClaim, undisclosedChanges, type VerifyContext } from "../src/verifiers";

const claim = (over: Partial<Claim>): Claim => ({ id: "c1", quote: "q q q", type: "version_bumped", subject: null, keywords: [], paths: [], symbols: [], count: null, command: null, span: null, ...over });
const file = (path: string, status: ChangedFile["status"] = "M"): ChangedFile => ({ path, status, additions: 1, deletions: 1, previousPath: null, isBinary: false });
const hunk = (path: string, adds: string[], dels: string[] = []): DiffHunk => ({
  path, oldStart: 1, newStart: 1,
  lines: [...dels.map((c, i) => ({ type: "del" as const, content: c, oldLine: i + 1, newLine: null })), ...adds.map((c, i) => ({ type: "add" as const, content: c, oldLine: null, newLine: i + 1 }))],
});
const ctx = (files: ChangedFile[], hunks: DiffHunk[] = []): VerifyContext => ({
  changeSet: { baseSha: "a", headSha: "b", files, hunks } as ChangeSet, filesAtHead: files.map((f) => f.path), mappings: new Map(), suite: null,
  bitechecks: new Map(), commands: new Map(), flags: [], execEnabled: true, readFileAtHead: async () => null,
});

describe("extraction of housekeeping claims", () => {
  it.each([
    ["Bumped version to 0.1.2.", "0.1.2"],
    ["Bumped the package version to v0.1.2", "0.1.2"],
    ["Version bump to 1.0.0-rc.1", "1.0.0-rc.1"],
    ["bumped to 2.3.4", "2.3.4"],
  ])("%s → version_bumped %s", (text, version) => {
    const c = extractClaims(text).find((x) => x.type === "version_bumped");
    expect(c?.subject).toBe(version);
  });
  it("'bumped version' without a number has no subject", () => {
    expect(extractClaims("Bumped the version.").find((x) => x.type === "version_bumped")?.subject).toBeNull();
  });
  it.each(["Regenerated goldens.", "Updated the snapshots.", "Regenerated the golden files", "Refreshed snapshots"])("%s → snapshots_updated", (text) => {
    expect(extractClaims(text).some((x) => x.type === "snapshots_updated")).toBe(true);
  });
  it("does not invent housekeeping claims from unrelated sentences", () => {
    const types = extractClaims("Added tests for the version parser. Updated the file src/a.ts.").map((c) => c.type);
    expect(types).not.toContain("version_bumped");
    expect(types).not.toContain("snapshots_updated");
  });
});

describe("version_bumped verifier", () => {
  const bump = (to: string) => ctx([file("package.json")], [hunk("package.json", [`  "version": "${to}",`], ['  "version": "0.1.1",'])]);
  it("verified when the version field changes to the claimed version, with the diff as evidence", async () => {
    const v = await verifyClaim(claim({ subject: "0.1.2" }), bump("0.1.2"));
    expect(v.status).toBe("verified");
    expect(v.evidence.map((e) => e.kind)).toEqual(["file", "hunk"]);
    expect(JSON.stringify(v.evidence)).toContain("package.json");
  });
  it("contradicted when it changed to a different version", async () => {
    const v = await verifyClaim(claim({ subject: "0.1.2" }), bump("0.1.3"));
    expect(v.status).toBe("contradicted");
    expect(v.reason).toContain("0.1.3");
  });
  it("contradicted when no version field changed at all", async () => {
    expect((await verifyClaim(claim({ subject: "0.1.2" }), ctx([file("src/a.ts")], [hunk("src/a.ts", ["const a = 1;"])]))).status).toBe("contradicted");
  });
  it("without a number, any version change verifies; also pyproject, Cargo and VERSION constants", async () => {
    expect((await verifyClaim(claim({}), bump("9.9.9"))).status).toBe("verified");
    expect((await verifyClaim(claim({ subject: "2.0.0" }), ctx([file("pyproject.toml")], [hunk("pyproject.toml", ['version = "2.0.0"'])]))).status).toBe("verified");
    expect((await verifyClaim(claim({ subject: "2.0.0" }), ctx([file("src/version.ts")], [hunk("src/version.ts", ['export const NOCAP_VERSION = "2.0.0";'])]))).status).toBe("verified");
  });
  it("a dependency's version range is not the package version", async () => {
    const c = ctx([file("package.json")], [hunk("package.json", ['    "zod": "^4.1.0",'])]);
    expect((await verifyClaim(claim({ subject: "4.1.0" }), c)).status).toBe("contradicted");
  });
  it("the version files count as covered, so they are not undisclosed", async () => {
    const x = bump("0.1.2");
    const v = await verifyClaim(claim({ subject: "0.1.2" }), x);
    expect(undisclosedChanges(x.changeSet.files, [v], [claim({ subject: "0.1.2" })])).toEqual([]);
  });
});

describe("snapshots_updated verifier", () => {
  it("recognises golden and snapshot paths", () => {
    for (const p of ["packages/core/test/__golden__/a.json", "test/__snapshots__/x.snap", "a/b.snap", "fixtures/scenarios/x/expected.json", "test/goldens/a.txt", "out.golden.json"]) expect(isGoldenPath(p), p).toBe(true);
    for (const p of ["src/golden.ts", "src/snapshot.ts", "README.md", "package.json"]) expect(isGoldenPath(p), p).toBe(false);
  });
  it("attaches every changed golden file as evidence, so none is undisclosed", async () => {
    const files = [file("packages/core/test/__golden__/a.json"), file("packages/core/test/__golden__/b.md"), file("test/__snapshots__/c.snap"), file("src/real.ts")];
    const x = ctx(files);
    const c = claim({ type: "snapshots_updated", subject: "goldens" });
    const v = await verifyClaim(c, x);
    expect(v.status).toBe("verified");
    expect(v.evidence).toHaveLength(3);
    expect(undisclosedChanges(files, [v], [c]).map((e) => (e.kind === "file" ? e.path : ""))).toEqual(["src/real.ts"]);
  });
  it("is ! (never ✗) when no golden or snapshot changed: regeneration can produce identical output", async () => {
    const v = await verifyClaim(claim({ type: "snapshots_updated" }), ctx([file("src/a.ts")]));
    expect(v.status).toBe("unverifiable");
  });
});

describe("end to end on a repo", () => {
  let dir = "";
  const git = (...a: string[]) => execFileSync("git", a, { cwd: dir, encoding: "utf8", env: { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "", GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t" } });
  const put = (rel: string, text: string) => {
    mkdirSync(dirname(join(dir, rel)), { recursive: true });
    writeFileSync(join(dir, rel), text);
  };
  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "nocap-house-"));
    git("init", "-q", "-b", "main");
    put("package.json", '{\n  "name": "p",\n  "version": "0.1.1"\n}\n');
    put("test/__golden__/a.json", "{}\n");
    put("test/__golden__/b.md", "# a\n");
    put("src/x.ts", "export const x = 1;\n");
    git("add", "-A");
    git("commit", "-q", "-m", "base");
    put("package.json", '{\n  "name": "p",\n  "version": "0.1.2"\n}\n');
    put("test/__golden__/a.json", '{"v":2}\n');
    put("test/__golden__/b.md", "# b\n");
  });
  afterAll(async () => rm(dir, { recursive: true, force: true }));

  it("'Bumped version to 0.1.2. Regenerated goldens.' is verified with nothing undisclosed", async () => {
    const { receipt } = await verifyLocal({ repoPath: dir, summary: "Bumped version to 0.1.2. Regenerated goldens.", exec: false, offline: true, save: false }, { PATH: process.env.PATH ?? "", HOME: dir, NOCAP_OFFLINE: "1" });
    expect(receipt.claims.map((c) => `${c.claim.type}:${c.verdict.status}`).sort()).toEqual(["snapshots_updated:verified", "version_bumped:verified"]);
    expect(receipt.undisclosed).toEqual([]);
    expect(receipt.overall).toBe("PASS");
  }, 60_000);

  it("a wrong version is a ✗", async () => {
    const { receipt } = await verifyLocal({ repoPath: dir, summary: "Bumped version to 0.2.0.", exec: false, offline: true, save: false }, { PATH: process.env.PATH ?? "", HOME: dir, NOCAP_OFFLINE: "1" });
    expect(receipt.claims.find((c) => c.claim.type === "version_bumped")?.verdict.status).toBe("contradicted");
  }, 60_000);
});
