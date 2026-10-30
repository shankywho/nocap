import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { repairMarkdown } from "@nocap/core";
import { envFlag, verifyLocal } from "@nocap/core/adapters";

interface StopPayload {
  session_id?: string;
  transcript_path?: string;
  cwd?: string;
  stop_hook_active?: boolean;
  last_assistant_message?: string;
}

export type HookAgent = "claude" | "codex" | "gemini";
export const HOOK_AGENTS: readonly HookAgent[] = ["claude", "codex", "gemini"];

interface Parsed {
  cwd: string | undefined;
  summary: string | null;
  sessionId: string | undefined;
  active: boolean;
  /** Agent-specific stdout line that sends the agent back to work, or null when the agent cannot be blocked. */
  block: ((reason: string) => string) | null;
}

/**
 * Payload shapes are the best-known ones and UNVERIFIED against each agent's current docs (docs/decisions.md).
 * - claude: Stop hook JSON on stdin; block = {"decision":"block","reason"}.
 * - codex: `notify` runs the program with one JSON argument (type agent-turn-complete, kebab-case keys). It cannot block.
 * - gemini: AfterAgent hook JSON on stdin (prompt_response); block = {"decision":"deny","reason"}.
 */
async function parsePayload(agent: HookAgent, raw: unknown): Promise<Parsed> {
  const o = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" ? v : undefined);
  if (agent === "codex") {
    if (o.type !== undefined && o.type !== "agent-turn-complete") return { cwd: undefined, summary: null, sessionId: undefined, active: false, block: null };
    return {
      cwd: str(o.cwd),
      summary: str(o["last-assistant-message"]) ?? str(o.last_assistant_message) ?? null,
      sessionId: str(o["thread-id"]) ?? str(o["turn-id"]) ?? str(o.session_id),
      active: false,
      block: null,
    };
  }
  if (agent === "gemini") {
    return {
      cwd: str(o.cwd),
      summary: str(o.prompt_response) ?? null,
      sessionId: str(o.session_id),
      active: o.stop_hook_active === true,
      block: (reason) => JSON.stringify({ decision: "deny", reason }),
    };
  }
  const p = o as StopPayload;
  return {
    cwd: p.cwd,
    summary: p.last_assistant_message ?? (await lastAssistantText(p.transcript_path)),
    sessionId: p.session_id,
    active: p.stop_hook_active === true,
    block: (reason) => JSON.stringify({ decision: "block", reason }),
  };
}

const MAX_BLOCKS = 2;

/** Best-effort: the last assistant text block from the transcript JSONL (the format is internal and unstable). */
async function lastAssistantText(path: string | undefined): Promise<string | null> {
  if (!path) return null;
  try {
    const lines = (await readFile(path, "utf8")).split("\n").filter(Boolean);
    for (let i = lines.length - 1; i >= 0; i--) {
      const entry = JSON.parse(lines[i] ?? "{}") as { type?: string; role?: string; message?: { role?: string; content?: unknown } };
      const role = entry.message?.role ?? entry.role ?? entry.type;
      if (role !== "assistant") continue;
      const content = entry.message?.content;
      if (typeof content === "string") return content;
      if (Array.isArray(content)) {
        const text = content
          .filter((b): b is { type: string; text: string } => typeof b === "object" && b !== null && (b as { type?: unknown }).type === "text" && typeof (b as { text?: unknown }).text === "string")
          .map((b) => b.text)
          .join("\n");
        if (text.trim()) return text;
      }
    }
  } catch {
    // unreadable transcript: treat as no summary
  }
  return null;
}

async function readState(file: string): Promise<Record<string, number>> {
  try {
    return JSON.parse(await readFile(file, "utf8")) as Record<string, number>;
  } catch {
    return {};
  }
}

export interface HookIO {
  stdin: string;
  stdout: (text: string) => void;
  stderr: (text: string) => void;
}

/** Agent hook (claude Stop, codex notify, gemini AfterAgent). Report-only by default; blocks only with NOCAP_BLOCK=1 where the agent supports it. Always exits 0. */
export async function runHook(io: HookIO, env: NodeJS.ProcessEnv = process.env, agent: HookAgent = "claude"): Promise<number> {
  try {
    const parsed = await parsePayload(agent, JSON.parse(io.stdin || "{}"));
    const repoPath = parsed.cwd ?? process.cwd();
    const summary = parsed.summary;
    if (!summary || summary.trim().length === 0) return 0;

    const { receipt, repair, savedTo } = await verifyLocal(
      { repoPath, summary, agent: agent === "claude" ? "claude-code" : agent === "codex" ? "codex" : "gemini-cli", chain: "auto", offline: envFlag(env.NOCAP_OFFLINE) },
      env,
    );
    if (receipt.claims.length === 0) return 0;

    const t = receipt.totals;
    io.stderr(`nocap: ${receipt.overall} ${t.contradicted}✗ ${t.unverifiable}!${savedTo ? ` → ${savedTo.replace(`${repoPath}/`, "")}` : ""}\n`);

    if (parsed.block && envFlag(env.NOCAP_BLOCK) && receipt.overall === "FAIL" && repair && !parsed.active) {
      const stateFile = join(repoPath, ".nocap", "hook-state.json");
      const state = await readState(stateFile);
      const key = `${agent}:${parsed.sessionId ?? "default"}`;
      if ((state[key] ?? 0) < MAX_BLOCKS) {
        state[key] = (state[key] ?? 0) + 1;
        await mkdir(join(repoPath, ".nocap"), { recursive: true });
        await writeFile(stateFile, JSON.stringify(state));
        io.stdout(`${parsed.block(repairMarkdown(repair))}\n`);
      }
    }
    return 0;
  } catch (error) {
    // A hook must never break the agent's session.
    io.stderr(`nocap: hook error: ${error instanceof Error ? error.message : String(error)}\n`);
    return 0;
  }
}

export async function readStdinText(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}
