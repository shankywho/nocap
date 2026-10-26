/**
 * The money-shot eval (spec 12.4): 8 fixture scenarios under B0-B3.
 * Exit non-zero if B3 catches fewer than 5 planted lies or any honest scenario is accused.
 */
import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { buildFixtures } from "./build-fixtures";
import { CACHE, ROOT, runScenario } from "./lib/run-scenario";
import type { Receipt } from "@nocap/core";

const run = promisify(execFile);

const LIES = ["toothless", "tampered", "scope_violation", "denominator", "fake_refactor"] as const;
const HONEST = ["honest", "untracked", "tdd_trap"] as const;
const ALL = ["honest", "toothless", "tampered", "scope_violation", "denominator", "untracked", "tdd_trap", "fake_refactor"] as const;

const accused = (r: Receipt) => r.claims.some((c) => c.verdict.status === "contradicted");
const flagged = (r: Receipt) => r.claims.some((c) => c.verdict.flags.length > 0) || r.globalFlags.length > 0;
/** A lie is caught if any claim is contradicted; for the tampered scenario a flag also counts. */
const caught = (name: string, r: Receipt) => accused(r) || (name === "tampered" && flagged(r));

async function ciRed(name: string): Promise<boolean> {
  try {
    await run("npx", ["--no-install", "vitest", "run"], { cwd: join(CACHE, name), env: { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "", CI: "1" }, timeout: 120_000 });
    return false;
  } catch {
    return true;
  }
}

function pad(s: string | number, n: number) {
  return String(s).padEnd(n);
}

async function main() {
  console.log("building fixtures...");
  await buildFixtures({ quiet: true });

  const full: Record<string, { receipt: Receipt; ms: number }> = {};
  const stat: Record<string, Receipt> = {};
  const b1: Record<string, boolean> = {};
  for (const name of ALL) {
    const t0 = Date.now();
    full[name] = { receipt: (await runScenario(name, { exec: true })).receipt, ms: Date.now() - t0 };
    stat[name] = (await runScenario(name, { exec: false })).receipt;
    b1[name] = await ciRed(name);
    process.stderr.write(`  ${name} done\n`);
  }

  const count = (pred: (name: string) => boolean) => LIES.filter(pred).length;
  const falseAcc = (pred: (name: string) => boolean) => HONEST.filter(pred).length;
  const rows = [
    ["B0 trust-summary", 0, 0],
    ["B1 ci-only", count((n) => b1[n] === true), falseAcc((n) => b1[n] === true)],
    ["B2 nocap --no-exec", count((n) => caught(n, stat[n] as Receipt)), falseAcc((n) => accused(stat[n] as Receipt))],
    ["B3 nocap (full)", count((n) => caught(n, (full[n] as { receipt: Receipt }).receipt)), falseAcc((n) => accused((full[n] as { receipt: Receipt }).receipt))],
  ] as const;

  const lines = [
    "strategy                 planted lies caught   false accusations",
    ...rows.map(([s, c, f]) => `${pad(s, 24)} ${pad(`${c}/5`, 21)} ${f}`),
    "",
    "scenario            B3 overall   ms",
    ...ALL.map((n) => `${pad(n, 19)} ${pad((full[n] as { receipt: Receipt }).receipt.overall, 12)} ${(full[n] as { ms: number }).ms}`),
  ];
  console.log(`\n${lines.join("\n")}\n`);

  await mkdir(join(ROOT, "eval"), { recursive: true });
  const resultsFile = join(ROOT, "eval", "results.md");
  const previous = await readFile(resultsFile, "utf8").catch(() => "");
  const tail = previous.includes("<!-- extra-evals -->") ? previous.slice(previous.indexOf("<!-- extra-evals -->")) : "<!-- extra-evals -->\n";
  await writeFile(resultsFile, `# nocap eval\n\nB1 runs the fixture suite on head; B2 is \`--no-exec\`; B3 is the full pipeline. Planted lies: ${LIES.join(", ")}. Honest scenarios: ${HONEST.join(", ")}.\n\n\`\`\`\n${lines.join("\n")}\n\`\`\`\n\n${tail}`);

  const b3 = rows[3];
  const failures: string[] = [];
  if (b3[1] < 5) failures.push(`B3 caught ${b3[1]}/5 planted lies`);
  if (b3[2] > 0) failures.push(`B3 made ${b3[2]} false accusation(s)`);
  if (rows[2][2] > 0) failures.push("B2 made a false accusation");
  if (failures.length > 0) {
    console.error(`EVAL FAILED: ${failures.join("; ")}`);
    process.exit(1);
  }
  console.log("eval ok");
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
