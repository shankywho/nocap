import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runInitAll, upsertCodexToml } from "../src/commands/initAll";

let repo = "";
let home = "";
let bin = "";
const run = async (write: boolean, user = false) => {
  let out = "";
  await runInitAll({ write, user, env: { cwd: repo, home, path: bin }, out: (t) => (out += t) });
  return out;
};
const read = (p: string) => readFile(join(repo, p), "utf8");

describe("init --all (fake HOME, stubbed PATH)", () => {
  beforeAll(async () => {
    repo = await mkdtemp(join(tmpdir(), "nocap-repo-"));
    home = await mkdtemp(join(tmpdir(), "nocap-home-"));
    bin = await mkdtemp(join(tmpdir(), "nocap-bin-"));
    for (const cmd of ["claude", "opencode", "gemini"]) {
      await writeFile(join(bin, cmd), "#!/bin/sh\n");
      await chmod(join(bin, cmd), 0o755);
    }
    await mkdir(join(home, ".codex"), { recursive: true });
    await writeFile(join(home, ".codex", "config.toml"), 'model = "gpt-5"\n\n[mcp_servers.other]\ncommand = "other"\n');
    await mkdir(join(repo, ".cursor"), { recursive: true });
    await writeFile(join(repo, ".cursor", "mcp.json"), JSON.stringify({ mcpServers: { unrelated: { command: "x" } } }));
    await writeFile(join(repo, "CLAUDE.md"), "# Project\n");
  });
  afterAll(async () => {
    for (const d of [repo, home, bin]) await rm(d, { recursive: true, force: true });
  });

  it("dry run lists every agent and changes nothing", async () => {
    const out = await run(false);
    for (const a of ["claude", "codex", "cursor", "opencode", "gemini"]) expect(out).toContain(a);
    expect(out).toContain("Dry run");
    expect(existsSync(join(repo, ".mcp.json"))).toBe(false);
    expect(existsSync(join(repo, "AGENTS.md"))).toBe(false);
  });

  it("--write configures everything, preserves unrelated entries and backs up", async () => {
    await run(true);
    expect(JSON.parse(await read(".mcp.json")).mcpServers.nocap.args).toEqual(["-y", "@shankywho/nocap", "mcp"]);
    expect(JSON.parse(await read(".claude/settings.json")).hooks.Stop[0].hooks[0].command).toContain("nocap hook claude");
    const cursor = JSON.parse(await read(".cursor/mcp.json"));
    expect(cursor.mcpServers.unrelated).toEqual({ command: "x" });
    expect(cursor.mcpServers.nocap).toBeDefined();
    expect(existsSync(join(repo, ".cursor", "mcp.json.bak"))).toBe(true);
    expect(JSON.parse(await read("opencode.json")).mcp.nocap).toEqual({ type: "local", command: ["npx", "-y", "@shankywho/nocap", "mcp"], enabled: true });
    expect(JSON.parse(await read(".gemini/settings.json")).mcpServers.nocap).toBeDefined();
    for (const f of ["AGENTS.md", "CLAUDE.md"]) expect(await read(f)).toContain("<!-- nocap:start -->");
    expect(await read("CLAUDE.md")).toContain("# Project");
    // Codex user config is untouched without --user
    expect(await readFile(join(home, ".codex", "config.toml"), "utf8")).not.toContain("nocap");
  });

  it("Codex needs --write --user, and keeps the rest of the file", async () => {
    await run(true, true);
    const toml = await readFile(join(home, ".codex", "config.toml"), "utf8");
    expect(toml).toContain('[mcp_servers.nocap]\ncommand = "npx"');
    expect(toml).toContain("[mcp_servers.other]");
    expect(toml).toContain('model = "gpt-5"');
  });

  it("a second run reports already configured and writes nothing new", async () => {
    const before = await read("AGENTS.md");
    const out = await run(true, true);
    expect(out).toContain("Already configured");
    expect(out).not.toContain("(dry run)");
    expect(await read("AGENTS.md")).toBe(before);
    expect((await read("AGENTS.md")).match(/nocap:start/g)).toHaveLength(1);
  });

  it("does not overwrite invalid JSON", async () => {
    await writeFile(join(repo, "opencode.json"), "{ not json");
    const out = await run(true, true);
    expect(out).toContain("not valid JSON");
    expect(await read("opencode.json")).toBe("{ not json");
  });
});

describe("upsertCodexToml", () => {
  it("replaces an outdated table and is a no-op when current", () => {
    const old = '[mcp_servers.nocap]\ncommand = "old"\n\n[x]\na = 1\n';
    const next = upsertCodexToml(old) ?? "";
    expect(next).toContain('command = "npx"');
    expect(next).toContain("[x]\na = 1");
    expect(upsertCodexToml(next)).toBeNull();
  });
});
