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

/** Claude Code Stop hook. Report-only by default; blocks only with NOCAP_BLOCK=1. Always exits 0. */
export async function runHook(io: HookIO, env: NodeJS.ProcessEnv = process.env): Promise<number> {
  try {
    const payload = JSON.parse(io.stdin || "{}") as StopPayload;
    const repoPath = payload.cwd ?? process.cwd();
    const summary = payload.last_assistant_message ?? (await lastAssistantText(payload.transcript_path));
    if (!summary || summary.trim().length === 0) return 0;

    const { receipt, repair, savedTo } = await verifyLocal(
      { repoPath, summary, agent: "claude-code", chain: "auto", offline: envFlag(env.NOCAP_OFFLINE) },
      env,
    );
    if (receipt.claims.length === 0) return 0;

    const t = receipt.totals;
    io.stderr(`nocap: ${receipt.overall} ${t.contradicted}✗ ${t.unverifiable}!${savedTo ? ` → ${savedTo.replace(`${repoPath}/`, "")}` : ""}\n`);

    if (envFlag(env.NOCAP_BLOCK) && receipt.overall === "FAIL" && repair && payload.stop_hook_active !== true) {
      const stateFile = join(repoPath, ".nocap", "hook-state.json");
      const state = await readState(stateFile);
      const key = payload.session_id ?? "default";
      if ((state[key] ?? 0) < MAX_BLOCKS) {
        state[key] = (state[key] ?? 0) + 1;
        await mkdir(join(repoPath, ".nocap"), { recursive: true });
        await writeFile(stateFile, JSON.stringify(state));
        io.stdout(`${JSON.stringify({ decision: "block", reason: repairMarkdown(repair) })}\n`);
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
