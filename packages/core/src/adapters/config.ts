import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

type Env = Record<string, string | undefined>;

/** Settings that `nocap config set` accepts, mapped to their stored field. */
export const CONFIG_KEYS = { "llm-key": "llmKey", "llm-base-url": "llmBaseUrl", "llm-model": "llmModel" } as const;
export type ConfigName = keyof typeof CONFIG_KEYS;

export interface UserConfig {
  llmKey?: string;
  llmBaseUrl?: string;
  llmModel?: string;
}

/** `$XDG_CONFIG_HOME/nocap/config.json`, else `~/.config/nocap/config.json`. */
export function configFile(env: Env): string | null {
  const base = env.XDG_CONFIG_HOME || (env.HOME ? join(env.HOME, ".config") : env.USERPROFILE ? join(env.USERPROFILE, ".config") : null);
  return base ? join(base, "nocap", "config.json") : null;
}

export function readConfig(env: Env): UserConfig {
  const file = configFile(env);
  if (!file || !existsSync(file)) return {};
  try {
    const data = JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;
    const out: UserConfig = {};
    for (const field of Object.values(CONFIG_KEYS)) if (typeof data[field] === "string" && data[field]) out[field] = data[field] as string;
    return out;
  } catch {
    return {};
  }
}

/** Writes one setting. The directory is 0700 and the file 0600 because it can hold an API key. */
export function writeConfigValue(env: Env, name: ConfigName, value: string): string {
  const file = configFile(env);
  if (!file) throw new Error("cannot find a home directory for the config file");
  mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
  const next = { ...readConfig(env), [CONFIG_KEYS[name]]: value };
  writeFileSync(file, `${JSON.stringify(next, null, 2)}\n`, { mode: 0o600 });
  chmodSync(file, 0o600);
  return file;
}

export type KeySource = "NOCAP_LLM_API_KEY" | "GROQ_API_KEY" | "LLM_API_KEY" | "config file";

/** Key lookup order: NOCAP_LLM_API_KEY, GROQ_API_KEY, LLM_API_KEY, then the config file. */
export function resolveLlmKey(env: Env): { key: string; source: KeySource } | null {
  for (const name of ["NOCAP_LLM_API_KEY", "GROQ_API_KEY", "LLM_API_KEY"] as const) {
    const value = env[name]?.trim();
    if (value) return { key: value, source: name };
  }
  const stored = readConfig(env).llmKey;
  return stored ? { key: stored, source: "config file" } : null;
}
