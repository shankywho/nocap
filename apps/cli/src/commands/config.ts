import { CONFIG_KEYS, configFile, readConfig, resolveLlmKey, writeConfigValue, type ConfigName } from "@nocap/core/adapters";

const names = Object.keys(CONFIG_KEYS) as ConfigName[];

/** `nocap config set <name> <value>` and `nocap config get [name]`. Secret values are never printed. */
export function runConfig(action: string, args: string[], env: NodeJS.ProcessEnv = process.env, out: (t: string) => void = (t) => process.stdout.write(t), err: (t: string) => void = (t) => process.stderr.write(t)): number {
  if (action === "set") {
    const [name, value] = args;
    if (!name || !names.includes(name as ConfigName)) {
      err(`nocap: unknown setting '${name ?? ""}'. Use one of: ${names.join(", ")}.\n`);
      return 2;
    }
    if (!value?.trim()) {
      err(`nocap: missing value. Usage: nocap config set ${name} <value>\n`);
      return 2;
    }
    try {
      const file = writeConfigValue(env, name as ConfigName, value.trim());
      out(`saved ${name} to ${file} (mode 600)\n`);
      return 0;
    } catch (error) {
      err(`nocap: ${error instanceof Error ? error.message : String(error)}\n`);
      return 2;
    }
  }
  if (action === "get") {
    const wanted = args[0];
    if (wanted && !names.includes(wanted as ConfigName)) {
      err(`nocap: unknown setting '${wanted}'. Use one of: ${names.join(", ")}.\n`);
      return 2;
    }
    const cfg = readConfig(env);
    const lines: string[] = [];
    if (!wanted || wanted === "llm-key") {
      const found = resolveLlmKey(env);
      lines.push(`llm-key: ${found ? `set (from ${found.source})` : "not set"}`);
    }
    if (!wanted || wanted === "llm-base-url") lines.push(`llm-base-url: ${cfg.llmBaseUrl ?? "default (https://api.groq.com/openai/v1)"}`);
    if (!wanted || wanted === "llm-model") lines.push(`llm-model: ${cfg.llmModel ?? "default (openai/gpt-oss-120b)"}`);
    if (!wanted) lines.push(`file: ${configFile(env) ?? "unavailable"}`);
    out(`${lines.join("\n")}\n`);
    return 0;
  }
  err("nocap: usage: nocap config set <name> <value> | nocap config get [name]\n");
  return 2;
}
