import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildFixtures } from "../../../scripts/build-fixtures";
import { runHook } from "../src/commands/hook";
import { mergeClaudeSettings, runInitClaude } from "../src/commands/init";

const root = fileURLToPath(new URL("../..", import.meta.url));
let cacheDir = "";
const baseEnv = { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "", MOCK_EXTERNALS: "true" };

async function fire(name: string, extra: Record<string, unknown>, env: Record<string, string>) {
  const summary = await readFile(join(fileURLToPath(new URL("../../..", import.meta.url)), "fixtures", "scenarios", name, "summary.md"), "utf8");
  let stdout = "";
  let stderr = "";
  const code = await runHook(
    {
      stdin: JSON.stringify({ session_id: "s1", cwd: join(cacheDir, name), hook_event_name: "Stop", last_assistant_message: summary, ...extra }),
      stdout: (t) => (stdout += t),
      stderr: (t) => (stderr += t),
    },
    { ...baseEnv, ...env },
  );
  return { code, stdout, stderr };
}

describe("Stop hook", () => {
  beforeAll(async () => {
    cacheDir = await mkdtemp(join(tmpdir(), "nocap-hook-"));
    await buildFixtures({ quiet: true, cacheDir });
  }, 120_000);
  afterAll(async () => {
    await rm(cacheDir, { recursive: true, force: true });
  });

  it("is report-only by default: one stderr line, no block", async () => {
    const r = await fire("toothless", {}, {});
    expect(r.code).toBe(0);
    expect(r.stdout).toBe("");
    expect(r.stderr).toMatch(/nocap: FAIL 1✗/);
  }, 60_000);

  it("NOCAP_BLOCK=1 blocks twice with repair text, then lets go (third call)", async () => {
    const env = { NOCAP_BLOCK: "1" };
    const a = await fire("scope_violation", {}, env);
    const b = await fire("scope_violation", {}, env);
    const c = await fire("scope_violation", {}, env);
    const first = JSON.parse(a.stdout);
    expect(first.decision).toBe("block");
    expect(first.reason).toContain("src/auth/session.ts");
    expect(JSON.parse(b.stdout).decision).toBe("block");
    expect(c.stdout).toBe("");
    expect(c.code).toBe(0);
  }, 120_000);

  it("never blocks when stop_hook_active is true", async () => {
    const r = await fire("fake_refactor", { stop_hook_active: true }, { NOCAP_BLOCK: "1" });
    expect(r.stdout).toBe("");
  }, 60_000);

  it("a PASS never blocks and a missing summary is silent", async () => {
    const ok = await fire("honest", {}, { NOCAP_BLOCK: "1" });
    expect(ok.stdout).toBe("");
    const none = await runHook({ stdin: JSON.stringify({ cwd: join(cacheDir, "honest") }), stdout: () => {}, stderr: () => {} }, baseEnv);
    expect(none).toBe(0);
  }, 60_000);

  it("reads the summary from the transcript when last_assistant_message is absent", async () => {
    const transcript = join(cacheDir, "t.jsonl");
    await writeFile(transcript, `${JSON.stringify({ type: "user", message: { role: "user", content: "hi" } })}\n${JSON.stringify({ type: "assistant", message: { role: "assistant", content: [{ type: "text", text: "Didn't touch auth. All tests pass." }] } })}\n`);
    let stderr = "";
    const code = await runHook({ stdin: JSON.stringify({ cwd: join(cacheDir, "honest"), transcript_path: transcript }), stdout: () => {}, stderr: (t) => (stderr += t) }, baseEnv);
    expect(code).toBe(0);
    expect(stderr).toContain("nocap:");
  }, 60_000);
});

describe("init claude", () => {
  it("merges without clobbering and is idempotent", () => {
    const existing = { permissions: { allow: ["Bash(ls)"] }, hooks: { Stop: [{ hooks: [{ type: "command", command: "echo hi" }] }], PreToolUse: [] } };
    const once = mergeClaudeSettings(existing);
    expect(once.changed).toBe(true);
    expect((once.settings.hooks as { Stop: unknown[] }).Stop).toHaveLength(2);
    expect(once.settings.permissions).toEqual(existing.permissions);
    expect(mergeClaudeSettings(once.settings).changed).toBe(false);
  });
  it("dry run changes nothing; --write creates the file; second run says already configured", async () => {
    const dir = await mkdtemp(join(tmpdir(), "nocap-init-"));
    const { existsSync } = await import("node:fs");
    await runInitClaude({ write: false, user: false, cwd: dir });
    expect(existsSync(join(dir, ".claude", "settings.json"))).toBe(false);
    await runInitClaude({ write: true, user: false, cwd: dir });
    expect(JSON.parse(await readFile(join(dir, ".claude", "settings.json"), "utf8")).hooks.Stop[0].hooks[0].command).toContain("nocap hook claude");
    await rm(dir, { recursive: true, force: true });
  });
  void root;
});
