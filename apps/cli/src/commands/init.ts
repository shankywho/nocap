import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

export const CLAUDE_HOOK = { type: "command", command: "npx -y nocap hook claude" } as const;

type Json = Record<string, unknown>;

/** Merge the Stop hook into a Claude Code settings object without clobbering anything else. Idempotent. */
export function mergeClaudeSettings(existing: Json): { settings: Json; changed: boolean } {
  const settings: Json = { ...existing };
  const hooks = { ...((settings.hooks as Json | undefined) ?? {}) } as Json;
  const stop = Array.isArray(hooks.Stop) ? [...(hooks.Stop as unknown[])] : [];
  const already = stop.some((entry) =>
    Array.isArray((entry as { hooks?: unknown[] }).hooks) &&
    ((entry as { hooks: { command?: string }[] }).hooks).some((h) => typeof h.command === "string" && h.command.includes("nocap hook")),
  );
  if (already) return { settings: existing, changed: false };
  stop.push({ hooks: [CLAUDE_HOOK] });
  hooks.Stop = stop;
  settings.hooks = hooks;
  return { settings, changed: true };
}

export async function runInitClaude(opts: { write: boolean; user: boolean; cwd?: string; home?: string }): Promise<number> {
  const cwd = opts.cwd ?? process.cwd();
  const file = opts.user ? join(opts.home ?? process.env.HOME ?? "", ".claude", "settings.json") : join(cwd, ".claude", "settings.json");
  let existing: Json = {};
  try {
    existing = JSON.parse(await readFile(file, "utf8")) as Json;
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) {
      process.stderr.write(`nocap: ${file} is not valid JSON; refusing to overwrite it.\n`);
      return 2;
    }
  }
  const { settings, changed } = mergeClaudeSettings(existing);
  if (!changed) {
    process.stdout.write(`already configured: ${file}\n`);
    return 0;
  }
  if (!opts.write) {
    process.stdout.write(`${JSON.stringify(settings, null, 2)}\n\n(dry run) add this to ${file}, or re-run with --write.\n`);
    return 0;
  }
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(settings, null, 2)}\n`);
  process.stdout.write(`wrote ${file}\n`);
  return 0;
}
