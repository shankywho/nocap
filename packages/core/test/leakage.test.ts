import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { buildFixtures } from "../../../scripts/build-fixtures";
import { childEnvFrom, verifyLocal } from "../src/adapters/local";
import { NO_INSTALL_ENV } from "../src/exec/safeEnv";

const ROOT = fileURLToPath(new URL("../../..", import.meta.url));
const tracked = () => execFileSync("git", ["ls-files", "-z"], { cwd: ROOT, encoding: "utf8" }).split("\0").filter(Boolean);
const isText = (p: string) => !/\.(png|jpg|jpeg|gif|ico|woff2?|ttf|tgz)$/.test(p);

// Patterns are assembled from parts so this file does not match itself.
const SECRET_PATTERNS: [string, RegExp][] = [
  ["Groq key", new RegExp(`gs${"k"}_[A-Za-z0-9]{20,}`)],
  ["OpenAI-style key", new RegExp(`s${"k"}-[A-Za-z0-9_-]{20,}`)],
  ["GitHub token", new RegExp(`gh[pousr]_[A-Za-z0-9]{30,}`)],
  ["GitHub fine-grained PAT", new RegExp(`github_${"pat"}_[A-Za-z0-9_]{20,}`)],
  ["AWS access key", new RegExp(`AK${"IA"}[0-9A-Z]{16}`)],
  ["Google API key", new RegExp(`AI${"za"}[0-9A-Za-z_-]{35}`)],
  ["Slack token", new RegExp(`xox[baprs]-[0-9A-Za-z-]{10,}`)],
  ["private key block", new RegExp(`-----BEGIN (RSA |EC |OPENSSH |DSA )?PRIVATE ${"KEY"}-----`)],
  ["DB url with password", /postgres(ql)?:\/\/[^\s"'@/:]+:[^\s"'@]{3,}@/],
  ["bearer literal", /Bearer [A-Za-z0-9._-]{30,}/],
];

describe("repository leakage", () => {
  it("tracks no secret-shaped strings", () => {
    const hits: string[] = [];
    for (const file of tracked().filter(isText)) {
      const path = join(ROOT, file);
      if (!existsSync(path) || statSync(path).size > 2_000_000) continue;
      const text = readFileSync(path, "utf8");
      for (const [name, re] of SECRET_PATTERNS) if (re.test(text)) hits.push(`${file}: ${name}`);
    }
    expect(hits).toEqual([]);
  });

  it("tracks no personal absolute paths or machine temp paths", () => {
    const hits: string[] = [];
    for (const file of tracked().filter(isText)) {
      if (file === "pnpm-lock.yaml") continue;
      const path = join(ROOT, file);
      if (!existsSync(path)) continue;
      const text = readFileSync(path, "utf8");
      if (/\/Users\/[a-z][\w.-]*\//i.test(text) || /\/home\/[a-z][\w.-]*\//.test(text) || /\/var\/folders\//.test(text)) hits.push(file);
    }
    // NOCAP_BUILD.md and docs may quote example paths; they must not contain a real home directory.
    expect(hits).toEqual([]);
  });

  it("never tracks .env files, and ignores them", () => {
    const files = tracked();
    expect(files.filter((f) => /(^|\/)\.env(\.|$)/.test(f) && !f.endsWith(".env.example"))).toEqual([]);
    const ignored = execFileSync("git", ["check-ignore", ".env", ".env.local", ".cache/x", ".nocap/receipts/x.json"], { cwd: ROOT, encoding: "utf8" });
    expect(ignored).toContain(".env");
    expect(ignored).toContain(".nocap/receipts/x.json");
  });

  it(".env.example holds no values for secret variables", () => {
    const lines = readFileSync(join(ROOT, ".env.example"), "utf8").split("\n");
    for (const line of lines) {
      const m = /^([A-Z_]*(KEY|TOKEN|SECRET|PASSWORD|DATABASE_URL|DIRECT_URL))=(.*)$/.exec(line);
      if (m) expect(m[3]?.split("#")[0]?.trim(), `${m[1]} must be empty`).toBe("");
    }
  });

  it("committed example and golden receipts carry no secrets, home paths or delete tokens", () => {
    const dirs = [join(ROOT, "examples"), join(ROOT, "packages/core/test/__golden__")];
    for (const dir of dirs) {
      for (const f of readdirSync(dir)) {
        const text = readFileSync(join(dir, f), "utf8");
        expect(text, f).not.toMatch(/deleteToken|deleteTokenHash|LLM_API_KEY|GITHUB_TOKEN/);
        expect(text, f).not.toMatch(/\/Users\/|\/home\/|\/var\/folders\/|\/private\/tmp/);
      }
    }
  });
});

describe("runtime leakage", () => {
  const SENTINELS = {
    LLM_API_KEY: "SENTINEL_LLM_KEY_9f31",
    LLM_FALLBACK_API_KEY: "SENTINEL_FALLBACK_KEY_77aa",
    GITHUB_TOKEN: "SENTINEL_GH_TOKEN_c0de",
    DATABASE_URL: `postgres://${"SENTINEL_DB_USER"}:SENTINEL_DB_PASS@db.example/x`,
    AWS_SECRET_ACCESS_KEY: "SENTINEL_AWS_5ec",
  };

  it("childEnvFrom passes only the allow-list to test runners", () => {
    const out = childEnvFrom({ ...SENTINELS, PATH: "/bin", HOME: "/h", CI: "0" });
    // the allow-list plus the fixed no-install guards, and nothing from the caller's secrets
    expect(Object.keys(out).filter((k) => !(k in NO_INSTALL_ENV)).sort()).toEqual(["CI", "HOME", "PATH"]);
    expect(JSON.stringify(out)).not.toContain("SENTINEL");
  });

  it("a full verify (exec on) writes no secret or absolute home path into receipts, repair text or saved files", async () => {
    const tmp = await mkdtemp(join(tmpdir(), "nocap-leak-"));
    try {
      await buildFixtures({ quiet: true, cacheDir: tmp, scenarios: ["toothless"] });
      const repo = join(tmp, "toothless");
      const summary = await readFile(join(ROOT, "fixtures/scenarios/toothless/summary.md"), "utf8");
      const env = { ...SENTINELS, PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "", NOCAP_OFFLINE: "1", MOCK_EXTERNALS: "true" };
      const { receipt, repair, savedTo } = await verifyLocal({ repoPath: repo, summary, agent: "leak-test", offline: true }, env);
      const blobs = [JSON.stringify(receipt), JSON.stringify(repair)];
      if (savedTo) blobs.push(await readFile(savedTo, "utf8"));
      const saved = join(repo, ".nocap");
      const walk = (dir: string): string[] => readdirSync(dir).flatMap((n) => (statSync(join(dir, n)).isDirectory() ? walk(join(dir, n)) : [join(dir, n)]));
      for (const f of existsSync(saved) ? walk(saved) : []) blobs.push(await readFile(f, "utf8"));
      const all = blobs.join("\n");
      expect(all).not.toContain("SENTINEL");
      expect(all).not.toContain(process.env.HOME ?? "\0never");
      expect(all).not.toContain(tmp);
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  }, 120_000);
});
