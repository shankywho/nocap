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

export const PROTOCOL_ANAKIN = `<!-- nocap:start -->
## Verify your work with nocap & Anakin MCP
1. At the start of a multi-agent task, call \`ledger_facts\`: treat CONTRADICTED and unverified teammate claims as unknown.
2. For external APIs, SDKs, or docs, verify claims against live web documentation using Anakin MCP or nocap \`verify_external_claim\`.
3. After writing tests, call \`bitecheck\` on them: a test that passes without your change proves nothing.
4. Before you say "done", call \`verify_claims\` with your summary.
5. If it fails, call \`get_repair\`, fix the items (never delete, skip or weaken tests; write \`Retracted: <quote>\` for claims you drop) and call \`verify_claims\` again.
<!-- nocap:end -->`;

export const MCP_ENTRY = { command: "npx", args: ["-y", "@shankywho/nocap", "mcp"] };
export const ANAKIN_MCP_ENTRY = {
  url: "https://mcp.anakin.io/mcp",
  headers: {
    Authorization: "Bearer ${ANAKIN_API_KEY}",
  },
};
export const ANAKIN_OPENCODE_ENTRY = {
  type: "remote",
  url: "https://mcp.anakin.io/mcp",
  headers: {
    Authorization: "Bearer ${ANAKIN_API_KEY}",
  },
  enabled: true,
};
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

async function mcpServersJson(
  agent: string,
  file: string,
  key: string,
  entries: Record<string, unknown>,
): Promise<Change> {
  const existing = await readJson(file);
  if (existing === null) return { agent, file, action: "skipped: existing file is not valid JSON", next: null };
  const section = { ...((existing[key] as Json | undefined) ?? {}) };
  let changed = false;
  const added: string[] = [];
  for (const [name, entry] of Object.entries(entries)) {
    if (!same(section[name], entry)) {
      section[name] = entry;
      changed = true;
      added.push(name);
    }
  }
  if (!changed) return { agent, file, action: "already configured", next: null };
  return {
    agent,
    file,
    action: `add ${added.join(" + ")} to ${key}`,
    next: `${JSON.stringify({ ...existing, [key]: section }, null, 2)}\n`,
  };
}

/** Upserts [mcp_servers.nocap] (and optionally [mcp_servers.anakin]) without a TOML library. */
export function upsertCodexToml(existing: string, anakin = false): string | null {
  const table = `[mcp_servers.nocap]\ncommand = "npx"\nargs = ["-y", "@shankywho/nocap", "mcp"]\n`;
  const anakinTable = `[mcp_servers.anakin]\nurl = "https://mcp.anakin.io/mcp"\nhttp_headers = { Authorization = "Bearer \${ANAKIN_API_KEY}" }\n`;
  const re = /^\[mcp_servers\.nocap\][^\n]*\n(?:(?!\[)[^\n]*\n?)*/m;
  const reAnakin = /^\[mcp_servers\.anakin\][^\n]*\n(?:(?!\[)[^\n]*\n?)*/m;

  let current = existing;
  if (re.test(current)) {
    current = current.replace(re, table + (current.match(re)?.[0].endsWith("\n\n") ? "\n" : ""));
  } else {
    current = `${current}${current === "" || current.endsWith("\n\n") ? "" : current.endsWith("\n") ? "\n" : "\n\n"}${table}`;
  }

  if (anakin) {
    if (reAnakin.test(current)) {
      current = current.replace(reAnakin, anakinTable + (current.match(reAnakin)?.[0].endsWith("\n\n") ? "\n" : ""));
    } else {
      current = `${current}${current === "" || current.endsWith("\n\n") ? "" : current.endsWith("\n") ? "\n" : "\n\n"}${anakinTable}`;
    }
  }

  return current === existing ? null : current;
}

async function protocolFile(agent: string, file: string, createIfMissing: boolean, anakin = false): Promise<Change | null> {
  const present = await exists(file);
  if (!present && !createIfMissing) return null;
  const proto = anakin ? PROTOCOL_ANAKIN : PROTOCOL;
  const current = present ? await readFile(file, "utf8") : "";
  const next = MARK.test(current)
    ? current.replace(MARK, proto)
    : `${current}${current === "" || current.endsWith("\n\n") ? "" : current.endsWith("\n") ? "\n" : "\n\n"}${proto}\n`;
  if (next === current) return { agent, file, action: "already configured", next: null };
  return { agent, file, action: MARK.test(current) ? "update nocap block" : "add nocap block", next };
}

export async function planInit(env: InitEnv, opts?: { anakin?: boolean }): Promise<Change[]> {
  const agents = await detectAgents(env);
  const changes: Change[] = [];
  const at = (p: string) => join(env.cwd, p);
  const withAnakin = opts?.anakin === true;

  const standardMcp = withAnakin
    ? { nocap: MCP_ENTRY, anakin: ANAKIN_MCP_ENTRY }
    : { nocap: MCP_ENTRY };

  const opencodeMcp = withAnakin
    ? {
        nocap: { type: "local", command: ["npx", "-y", "@shankywho/nocap", "mcp"], enabled: true },
        anakin: ANAKIN_OPENCODE_ENTRY,
      }
    : {
        nocap: { type: "local", command: ["npx", "-y", "@shankywho/nocap", "mcp"], enabled: true },
      };

  if (agents.includes("claude")) {
    changes.push(await mcpServersJson("claude", at(".mcp.json"), "mcpServers", standardMcp));
    const settingsFile = at(".claude/settings.json");
    const existing = await readJson(settingsFile);
    if (existing === null) changes.push({ agent: "claude", file: settingsFile, action: "skipped: existing file is not valid JSON", next: null });
    else {
      const merged = mergeClaudeSettings(existing);
      changes.push({ agent: "claude", file: settingsFile, action: merged.changed ? "add Stop hook" : "already configured", next: merged.changed ? `${JSON.stringify(merged.settings, null, 2)}\n` : null });
    }
  }
  if (agents.includes("cursor")) changes.push(await mcpServersJson("cursor", at(".cursor/mcp.json"), "mcpServers", standardMcp));
  if (agents.includes("opencode")) {
    changes.push(await mcpServersJson("opencode", at("opencode.json"), "mcp", opencodeMcp));
  }
  if (agents.includes("gemini")) changes.push(await mcpServersJson("gemini", at(".gemini/settings.json"), "mcpServers", standardMcp));
  if (agents.includes("codex")) {
    const file = join(env.home, ".codex", "config.toml");
    const current = (await exists(file)) ? await readFile(file, "utf8") : "";
    const next = upsertCodexToml(current, withAnakin);
    const actionDesc = withAnakin ? "add [mcp_servers.nocap] + [mcp_servers.anakin]" : "add [mcp_servers.nocap]";
    changes.push({ agent: "codex", file, action: next ? actionDesc : "already configured", next, needsUser: true });
  }
  if (agents.length > 0) {
    const agentsMd = await protocolFile("all", at("AGENTS.md"), true, withAnakin);
    if (agentsMd) changes.push(agentsMd);
    const claudeMd = await protocolFile("all", at("CLAUDE.md"), false, withAnakin);
    if (claudeMd) changes.push(claudeMd);
  }
  return changes;
}

export async function runInitAll(opts: { write: boolean; user: boolean; anakin?: boolean; env: InitEnv; out?: (t: string) => void }): Promise<number> {
  const out = opts.out ?? ((t: string) => process.stdout.write(t));
  const changes = await planInit(opts.env, { anakin: opts.anakin });
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
