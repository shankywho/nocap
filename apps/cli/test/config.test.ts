import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { llmStatus, makeLlm, resolveLlmKey } from "@nocap/core/adapters";
import { MockLlm } from "@nocap/core/adapters";
import { buildFixtures } from "../../../scripts/build-fixtures";
import { runCheck } from "../src/commands/check";
import { runConfig } from "../src/commands/config";

let home = "";
beforeAll(async () => {
  home = await mkdtemp(join(tmpdir(), "nocap-cfg-"));
});
afterAll(async () => rm(home, { recursive: true, force: true }));

function run(action: string, args: string[], env: Record<string, string> = { HOME: home }) {
  let out = "";
  let err = "";
  const code = runConfig(action, args, env, (t) => (out += t), (t) => (err += t));
  return { code, out, err };
}

describe("nocap config", () => {
  it("stores the key with mode 600, never prints it, and reports where it came from", async () => {
    const set = run("set", ["llm-key", "gsk_SECRETVALUE123"]);
    expect(set.code).toBe(0);
    expect(set.out).not.toContain("SECRETVALUE");
    const file = join(home, ".config", "nocap", "config.json");
    expect((await stat(file)).mode & 0o777).toBe(0o600);
    expect((await stat(join(home, ".config", "nocap"))).mode & 0o777).toBe(0o700);
    expect(JSON.parse(await readFile(file, "utf8")).llmKey).toBe("gsk_SECRETVALUE123");
    const get = run("get", []);
    expect(get.out).toContain("llm-key: set (from config file)");
    expect(get.out + get.err).not.toContain("SECRETVALUE");
  });

  it("rejects unknown settings and missing values", () => {
    expect(run("set", ["nope", "x"]).code).toBe(2);
    expect(run("set", ["llm-key"]).code).toBe(2);
    expect(run("get", ["nope"]).code).toBe(2);
    expect(run("wat", []).code).toBe(2);
  });

  it("looks up the key in order: NOCAP_LLM_API_KEY, GROQ_API_KEY, LLM_API_KEY, then the file", () => {
    const base = { HOME: home };
    expect(resolveLlmKey({ ...base, LLM_API_KEY: "c", GROQ_API_KEY: "b", NOCAP_LLM_API_KEY: "a" })).toEqual({ key: "a", source: "NOCAP_LLM_API_KEY" });
    expect(resolveLlmKey({ ...base, LLM_API_KEY: "c", GROQ_API_KEY: "b" })).toEqual({ key: "b", source: "GROQ_API_KEY" });
    expect(resolveLlmKey({ ...base, LLM_API_KEY: "c" })).toEqual({ key: "c", source: "LLM_API_KEY" });
    expect(resolveLlmKey(base)?.source).toBe("config file");
  });

  it("honours XDG_CONFIG_HOME and treats a corrupt file as no key", async () => {
    const xdg = await mkdtemp(join(tmpdir(), "nocap-xdg-"));
    expect(resolveLlmKey({ XDG_CONFIG_HOME: xdg })).toBeNull();
    run("set", ["llm-key", "k1"], { XDG_CONFIG_HOME: xdg });
    expect(resolveLlmKey({ XDG_CONFIG_HOME: xdg })?.key).toBe("k1");
    await writeFile(join(xdg, "nocap", "config.json"), "{not json");
    expect(resolveLlmKey({ XDG_CONFIG_HOME: xdg })).toBeNull();
    await rm(xdg, { recursive: true, force: true });
  });
});

describe("offline is never silent", () => {
  it("llmStatus distinguishes no key, a key, and an explicit offline request", async () => {
    const empty = await mkdtemp(join(tmpdir(), "nocap-empty-"));
    expect(llmStatus({ HOME: empty }, false).mode).toBe("offline-nokey");
    expect(llmStatus({ HOME: empty, GROQ_API_KEY: "k" }, false)).toEqual({ mode: "llm", source: "GROQ_API_KEY" });
    expect(llmStatus({ HOME: empty, GROQ_API_KEY: "k" }, true).mode).toBe("offline-flag");
    expect(llmStatus({ HOME: empty, NOCAP_OFFLINE: "1" }, false).mode).toBe("offline-flag");
    expect(makeLlm({ HOME: empty }, false)).toBeInstanceOf(MockLlm);
    await rm(empty, { recursive: true, force: true });
  });
});

describe("check output", () => {
  it("prints the offline banner once when no key exists, and the RESULT line says offline", async () => {
    const tmp = await mkdtemp(join(tmpdir(), "nocap-banner-"));
    const empty = await mkdtemp(join(tmpdir(), "nocap-nohome-"));
    await buildFixtures({ quiet: true, cacheDir: tmp, scenarios: ["honest"] });
    const errs: string[] = [];
    const outs: string[] = [];
    const e = process.stderr.write.bind(process.stderr);
    const o = process.stdout.write.bind(process.stdout);
    process.stderr.write = ((t: string) => (errs.push(String(t)), true)) as typeof process.stderr.write;
    process.stdout.write = ((t: string) => (outs.push(String(t)), true)) as typeof process.stdout.write;
    try {
      await runCheck({ cwd: join(tmp, "honest"), summaryText: "Added tests for the retry backoff in test/retry.test.ts.", exec: false }, { PATH: process.env.PATH ?? "", HOME: empty });
      await runCheck({ cwd: join(tmp, "honest"), summaryText: "Added tests for the retry backoff in test/retry.test.ts.", exec: false, offline: true }, { PATH: process.env.PATH ?? "", HOME: empty });
    } finally {
      process.stderr.write = e;
      process.stdout.write = o;
      await rm(tmp, { recursive: true, force: true });
      await rm(empty, { recursive: true, force: true });
    }
    const banners = errs.filter((l) => l.includes("offline extraction (regex)"));
    expect(banners).toHaveLength(1);
    expect(banners[0]).toContain("nocap config set llm-key");
    expect(outs.join("")).toMatch(/RESULT .*· offline/);
  }, 60_000);
});

describe("demo --live", () => {
  it("stays offline by default and refuses --live without a key", async () => {
    const { demoMode } = await import("../src/commands/demo");
    const empty = await mkdtemp(join(tmpdir(), "nocap-demo-live-"));
    expect(demoMode(false, { HOME: empty })).toEqual({ ok: true, offline: true });
    expect(demoMode(false, { HOME: empty, GROQ_API_KEY: "k" })).toEqual({ ok: true, offline: true });
    const refused = demoMode(true, { HOME: empty });
    expect(refused.ok).toBe(false);
    expect(refused.ok === false && refused.message).toContain("nocap config set llm-key");
    expect(demoMode(true, { HOME: empty, GROQ_API_KEY: "k" })).toEqual({ ok: true, offline: false });
    await rm(empty, { recursive: true, force: true });
  });

  it("with a live model the RESULT line names it; the offline default says offline", async () => {
    const tmp = await mkdtemp(join(tmpdir(), "nocap-live-"));
    await buildFixtures({ quiet: true, cacheDir: tmp, scenarios: ["toothless"] });
    const summary = await readFile(join(fileURLToPath(new URL("../../..", import.meta.url)), "fixtures/scenarios/toothless/summary.md"), "utf8");
    const mock = new MockLlm();
    const liveLlm = { json: async (a: Parameters<MockLlm["json"]>[0]) => ({ ...(await mock.json(a)), provider: "groq", model: "openai/gpt-oss-120b" }) } as MockLlm;
    const grab = async (opts: Parameters<typeof runCheck>[0]) => {
      const outs: string[] = [];
      const o = process.stdout.write.bind(process.stdout);
      const e = process.stderr.write.bind(process.stderr);
      process.stdout.write = ((t: string) => (outs.push(String(t)), true)) as typeof process.stdout.write;
      process.stderr.write = (() => true) as typeof process.stderr.write;
      try {
        await runCheck(opts, { PATH: process.env.PATH ?? "", HOME: tmp });
      } finally {
        process.stdout.write = o;
        process.stderr.write = e;
      }
      return outs.join("");
    };
    const live = await grab({ cwd: join(tmp, "toothless"), summaryText: summary, exec: false, offline: false, llm: liveLlm });
    expect(live).toMatch(/RESULT .*· gpt-oss-120b@groq/);
    const offline = await grab({ cwd: join(tmp, "toothless"), summaryText: summary, exec: false, offline: true });
    expect(offline).toMatch(/RESULT .*· offline/);
    await rm(tmp, { recursive: true, force: true });
  }, 60_000);
});
