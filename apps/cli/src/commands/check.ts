import { writeFile } from "node:fs/promises";
import { NocapEvents, renderJson, renderMarkdown, renderTerminal, repairMarkdown, type LlmPort, type Receipt, type RepairPacket } from "@nocap/core";
import { verifyLocal } from "@nocap/core/adapters";
import { publishReceipt } from "../io/publish.js";
import { createPrinter } from "../io/printer.js";
import { readSummary, UsageError } from "../io/readSummary.js";

export interface CheckOptions {
  summary?: string;
  base?: string;
  head?: string;
  agent?: string;
  exec?: boolean; // commander sets false for --no-exec
  offline?: boolean;
  scope?: string[];
  testCmd?: string;
  testFormat?: "jest" | "junit";
  json?: boolean;
  md?: boolean;
  out?: string;
  publish?: boolean;
  hunks?: boolean; // false for --no-hunks
  strict?: boolean;
  repair?: boolean;
  actor?: string;
  model?: string;
  role?: string;
  verbose?: boolean;
  chain?: string;
  sinceLast?: boolean;
  scopeRole?: string[];
  cwd?: string;
  /** Test seam: inject summary text instead of reading stdin/file. */
  summaryText?: string;
  llm?: LlmPort;
}

export interface CheckResult {
  exitCode: number;
  receipt: Receipt | null;
  repair: RepairPacket | null;
}

export async function runCheck(opts: CheckOptions, env: NodeJS.ProcessEnv = process.env): Promise<CheckResult> {
  const err = (message: string) => process.stderr.write(`nocap: ${message}\n`);
  try {
    const repoPath = opts.cwd ?? process.cwd();
    const summary = opts.summaryText ?? (await readSummary(opts.summary));
    const events = new NocapEvents();
    const printer = createPrinter({ verbose: opts.verbose === true, quiet: opts.json === true && !opts.verbose });
    events.on((e) => printer.onEvent(e));

    let output;
    try {
      output = await verifyLocal(
        {
          repoPath, summary, events, base: opts.base, head: opts.head, agent: opts.agent, actor: opts.actor, model: opts.model,
          role: opts.role, exec: opts.exec, offline: opts.offline, scope: opts.scope, testCommand: opts.testCmd,
          testFormat: opts.testFormat, chain: opts.chain, sinceLast: opts.sinceLast, scopeRole: opts.scopeRole, llm: opts.llm,
        },
        env,
      );
    } finally {
      printer.stop();
    }
    const { receipt, repair } = output;

    const color = process.stdout.isTTY === true && env.NO_COLOR === undefined;
    const text = opts.json ? renderJson(receipt) : opts.md ? renderMarkdown(receipt) : renderTerminal(receipt, { color });
    if (opts.out) await writeFile(opts.out, `${text}\n`);
    process.stdout.write(`${text}\n`);

    if (output.savedTo && !opts.json) process.stderr.write(`saved ${output.savedTo}\n`);

    if (opts.repair && repair && !opts.json) {
      process.stdout.write(`\n${repairMarkdown(repair)}\n`);
    }
    if (opts.publish) {
      const apiUrl = env.NOCAP_API_URL ?? "https://nocap.vercel.app";
      try {
        const published = await publishReceipt(receipt, { apiUrl, noHunks: opts.hunks === false });
        process.stderr.write(`published ${published.url}\n`);
      } catch (error) {
        err(error instanceof Error ? error.message : String(error));
      }
    }

    const exitCode = receipt.overall === "FAIL" ? 1 : receipt.overall === "MIXED" && opts.strict ? 3 : 0;
    return { exitCode, receipt, repair };
  } catch (error) {
    err(error instanceof Error ? error.message : String(error));
    if (error instanceof UsageError) err("run `nocap check --help` for usage.");
    return { exitCode: 2, receipt: null, repair: null };
  }
}
