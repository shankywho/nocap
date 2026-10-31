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

describe("codex notify and gemini AfterAgent hooks", () => {
  const dirs: string[] = [];
  beforeAll(async () => {
    cacheDir = await mkdtemp(join(tmpdir(), "nocap-hook2-"));
    dirs.push(cacheDir);
    await buildFixtures({ quiet: true, cacheDir, scenarios: ["toothless", "honest"] });
  }, 120_000);
  afterAll(async () => {
    await Promise.all(dirs.map((d) => rm(d, { recursive: true, force: true })));
  });

  async function fireAgent(agent: "codex" | "gemini", scenario: string, payload: (cwd: string, summary: string) => unknown, env: Record<string, string> = {}) {
    const summary = await readFile(join(fileURLToPath(new URL("../../..", import.meta.url)), "fixtures", "scenarios", scenario, "summary.md"), "utf8");
    let stdout = "";
    let stderr = "";
    const code = await runHook(
      { stdin: JSON.stringify(payload(join(cacheDir, scenario), summary)), stdout: (t) => (stdout += t), stderr: (t) => (stderr += t) },
      { ...baseEnv, ...env },
      agent,
    );
    return { code, stdout, stderr };
  }
  const codex = (cwd: string, summary: string) => ({ type: "agent-turn-complete", "thread-id": "t1", cwd, "input-messages": ["go"], "last-assistant-message": summary });
  const gemini = (cwd: string, summary: string) => ({ session_id: "g1", cwd, hook_event_name: "AfterAgent", prompt: "go", prompt_response: summary, stop_hook_active: false });

  it("codex: reports on stderr, never blocks, even with NOCAP_BLOCK=1", async () => {
    const r = await fireAgent("codex", "toothless", codex, { NOCAP_BLOCK: "1" });
    expect(r.code).toBe(0);
    expect(r.stderr).toMatch(/nocap: FAIL 1✗/);
    expect(r.stdout).toBe("");
  });

  it("codex: ignores other notification types", async () => {
    const r = await fireAgent("codex", "toothless", (cwd, s) => ({ ...codex(cwd, s), type: "approval-requested" }));
    expect(r.stderr).toBe("");
  });

  it("gemini: report-only by default, deny with NOCAP_BLOCK=1 and at most twice", async () => {
    const quiet = await fireAgent("gemini", "toothless", gemini);
    expect(quiet.stdout).toBe("");
    expect(quiet.stderr).toMatch(/nocap: FAIL/);
    const blocked = await fireAgent("gemini", "toothless", gemini, { NOCAP_BLOCK: "1" });
    const out = JSON.parse(blocked.stdout) as { decision: string; reason: string };
    expect(out.decision).toBe("deny");
    expect(out.reason).toContain("repair packet");
    await fireAgent("gemini", "toothless", gemini, { NOCAP_BLOCK: "1" });
    expect((await fireAgent("gemini", "toothless", gemini, { NOCAP_BLOCK: "1" })).stdout).toBe("");
  }, 90_000);

  it("gemini: does not block when stop_hook_active is true; honest summaries pass silently of blocks", async () => {
    const again = await fireAgent("gemini", "toothless", (c, s) => ({ ...gemini(c, s), session_id: "g2", stop_hook_active: true }), { NOCAP_BLOCK: "1" });
    expect(again.stdout).toBe("");
    const ok = await fireAgent("gemini", "honest", (c, s) => ({ ...gemini(c, s), session_id: "g3" }), { NOCAP_BLOCK: "1" });
    expect(ok.stdout).toBe("");
  });

  it("malformed payloads exit 0 and say nothing on stdout", async () => {
    let out = "";
    const code = await runHook({ stdin: "{not json", stdout: (t) => (out += t), stderr: () => undefined }, baseEnv, "gemini");
    expect(code).toBe(0);
    expect(out).toBe("");
  });

  it("never prints secrets from the environment", async () => {
    const r = await fireAgent("gemini", "toothless", gemini, { NOCAP_BLOCK: "1", LLM_API_KEY: "SENTINEL_KEY_zz", GITHUB_TOKEN: "SENTINEL_GH_zz" });
    expect(r.stdout + r.stderr).not.toContain("SENTINEL");
  });
});
