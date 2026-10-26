import { access, constants, copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { mergeClaudeSettings } from "./init.js";

type Json = Record<string, unknown>;

export const PROTOCOL = `<!-- nocap:start -->
## Verify your work with nocap
1. At the start of a multi-agent task, call \`ledger_facts\`: treat CONTRADICTED and unverified teammate claims as unknown.
2. After writing tests, call \`bitecheck\` on them: a test that passes without your change proves nothing.
3. Before you say "done", call \`verify_claims\` with your summary.
4. If it fails, call \`get_repair\`, fix the items (never delete, skip or weaken tests; write \`Retracted: <quote>\` for claims you drop) and call \`verify_claims\` again.
<!-- nocap:end -->`;

const MCP_ENTRY = { command: "npx", args: ["-y", "nocap", "mcp"] };
const MARK = /<!-- nocap:start -->[\s\S]*?<!-- nocap:end -->/;

export interface InitEnv {
  cwd: string;
  home: string;
  path: string;
}

export interface Change {
  agent: string;
  file: string;
  /** Short description of what changes. */
  action: string;
  next: string | null; // null = already configured
  needsUser?: boolean;
}

async function exists(path: string): Promise<boolean> {
  return access(path, constants.F_OK).then(() => true, () => false);
}

async function which(cmd: string, pathVar: string): Promise<boolean> {
  for (const dir of pathVar.split(":").filter(Boolean)) if (await exists(join(dir, cmd))) return true;
  return false;
}

export async function detectAgents(env: InitEnv): Promise<string[]> {
  const found: string[] = [];
  if ((await which("claude", env.path)) || (await exists(join(env.home, ".claude")))) found.push("claude");
  if ((await which("codex", env.path)) || (await exists(join(env.home, ".codex")))) found.push("codex");
  if ((await exists(join(env.cwd, ".cursor"))) || (await which("cursor", env.path))) found.push("cursor");
  if ((await which("opencode", env.path)) || (await exists(join(env.cwd, "opencode.json")))) found.push("opencode");
  if ((await which("gemini", env.path)) || (await exists(join(env.home, ".gemini")))) found.push("gemini");
  return found;
}

async function readJson(file: string): Promise<Json | null> {
  try {
    return JSON.parse(await readFile(file, "utf8")) as Json;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return {};
    return null; // unparsable: never overwrite
  }
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

async function mcpServersJson(agent: string, file: string, key: string, entry: unknown): Promise<Change> {
  const existing = await readJson(file);
  if (existing === null) return { agent, file, action: "skipped: existing file is not valid JSON", next: null };
  const section = { ...((existing[key] as Json | undefined) ?? {}) };
  if (same(section.nocap, entry)) return { agent, file, action: "already configured", next: null };
  section.nocap = entry;
  return { agent, file, action: `add nocap to ${key}`, next: `${JSON.stringify({ ...existing, [key]: section }, null, 2)}\n` };
}

/** Upserts a [mcp_servers.nocap] table without a TOML library: replaces just that table, keeps everything else. */
export function upsertCodexToml(existing: string): string | null {
  const table = `[mcp_servers.nocap]\ncommand = "npx"\nargs = ["-y", "nocap", "mcp"]\n`;
  const re = /^\[mcp_servers\.nocap\][^\n]*\n(?:(?!\[)[^\n]*\n?)*/m;
  if (re.test(existing)) {
    const replaced = existing.replace(re, table + (existing.match(re)?.[0].endsWith("\n\n") ? "\n" : ""));
    return replaced === existing ? null : replaced;
  }
  return `${existing}${existing === "" || existing.endsWith("\n\n") ? "" : existing.endsWith("\n") ? "\n" : "\n\n"}${table}`;
}

async function protocolFile(agent: string, file: string, createIfMissing: boolean): Promise<Change | null> {
  const present = await exists(file);
  if (!present && !createIfMissing) return null;
  const current = present ? await readFile(file, "utf8") : "";
  const next = MARK.test(current) ? current.replace(MARK, PROTOCOL) : `${current}${current === "" || current.endsWith("\n\n") ? "" : current.endsWith("\n") ? "\n" : "\n\n"}${PROTOCOL}\n`;
  if (next === current) return { agent, file, action: "already configured", next: null };
  return { agent, file, action: MARK.test(current) ? "update nocap block" : "add nocap block", next };
}

export async function planInit(env: InitEnv): Promise<Change[]> {
  const agents = await detectAgents(env);
  const changes: Change[] = [];
  const at = (p: string) => join(env.cwd, p);

  if (agents.includes("claude")) {
    changes.push(await mcpServersJson("claude", at(".mcp.json"), "mcpServers", MCP_ENTRY));
    const settingsFile = at(".claude/settings.json");
    const existing = await readJson(settingsFile);
    if (existing === null) changes.push({ agent: "claude", file: settingsFile, action: "skipped: existing file is not valid JSON", next: null });
    else {
      const merged = mergeClaudeSettings(existing);
      changes.push({ agent: "claude", file: settingsFile, action: merged.changed ? "add Stop hook" : "already configured", next: merged.changed ? `${JSON.stringify(merged.settings, null, 2)}\n` : null });
    }
  }
  if (agents.includes("cursor")) changes.push(await mcpServersJson("cursor", at(".cursor/mcp.json"), "mcpServers", MCP_ENTRY));
  if (agents.includes("opencode")) {
    changes.push(await mcpServersJson("opencode", at("opencode.json"), "mcp", { type: "local", command: ["npx", "-y", "nocap", "mcp"], enabled: true }));
  }
  if (agents.includes("gemini")) changes.push(await mcpServersJson("gemini", at(".gemini/settings.json"), "mcpServers", MCP_ENTRY));
  if (agents.includes("codex")) {
    const file = join(env.home, ".codex", "config.toml");
    const current = (await exists(file)) ? await readFile(file, "utf8") : "";
    const next = upsertCodexToml(current);
    changes.push({ agent: "codex", file, action: next ? "add [mcp_servers.nocap]" : "already configured", next, needsUser: true });
  }
  if (agents.length > 0) {
    const agentsMd = await protocolFile("all", at("AGENTS.md"), true);
    if (agentsMd) changes.push(agentsMd);
    const claudeMd = await protocolFile("all", at("CLAUDE.md"), false);
    if (claudeMd) changes.push(claudeMd);
  }
  return changes;
}

export async function runInitAll(opts: { write: boolean; user: boolean; env: InitEnv; out?: (t: string) => void }): Promise<number> {
  const out = opts.out ?? ((t: string) => process.stdout.write(t));
  const changes = await planInit(opts.env);
  if (changes.length === 0) {
    out("No supported agents detected (looked for Claude Code, Codex, Cursor, OpenCode, Gemini CLI).\n");
    return 0;
  }
  const rows = changes.map((c) => {
    const skipUser = c.needsUser && !opts.user;
    const status = c.next === null ? c.action : skipUser ? `${c.action} (needs --write --user)` : opts.write ? c.action : `${c.action} (dry run)`;
    return `${c.agent.padEnd(9)} ${c.file.replace(`${opts.env.cwd}/`, "").replace(opts.env.home, "~").padEnd(40)} ${status}`;
  });
  out(`${rows.join("\n")}\n`);
  if (!opts.write) {
    out("\nDry run. Re-run with --write to apply (Codex also needs --user).\n");
    return 0;
  }
  for (const c of changes) {
    if (c.next === null || (c.needsUser && !opts.user)) continue;
    await mkdir(dirname(c.file), { recursive: true });
    if (await exists(c.file)) await copyFile(c.file, `${c.file}.bak`);
    await writeFile(c.file, c.next);
  }
  if (changes.every((c) => c.next === null)) out("\nAlready configured.\n");
  return 0;
}
