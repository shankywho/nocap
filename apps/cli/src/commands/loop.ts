import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { repairMarkdown, runLoop as drive } from "@nocap/core";
import { readSummary } from "../io/readSummary.js";
import { runCheck } from "./check.js";

const run = promisify(execFile);

export interface LoopOptions {
  agentCmd: string;
  summary?: string;
  summaryFrom?: string;
  max?: string;
  exec?: boolean;
  agent?: string;
  base?: string;
  verbose?: boolean;
  cwd?: string;
  summaryText?: string;
}

export async function runLoop(opts: LoopOptions, env: NodeJS.ProcessEnv = process.env): Promise<number> {
  const cwd = opts.cwd ?? process.cwd();
  const say = (text: string) => process.stderr.write(`${text}\n`);
  try {
    const initial = opts.summaryText ?? (await readSummary(opts.summary));
    const max = Math.max(1, Number.parseInt(opts.max ?? "3", 10) || 3);
    const from = opts.summaryFrom ?? "stdout";
    if (from !== "stdout" && !from.startsWith("file:")) throw new Error("--summary-from must be stdout or file:<path>");

    const result = await drive(
      {
        async check(summary, chainId) {
          const r = await runCheck(
            {
              cwd, summaryText: summary, chain: chainId ?? "auto", exec: opts.exec, ...(opts.agent ? { agent: opts.agent } : {}),
              ...(opts.base ? { base: opts.base } : {}), ...(opts.verbose ? { verbose: true } : {}),
            },
            env,
          );
          if (!r.receipt) throw new Error("check failed");
          return { receipt: r.receipt, repair: r.repair };
        },
        async writeRepair(packet, attempt) {
          const dir = join(cwd, ".nocap", "repairs");
          await mkdir(dir, { recursive: true });
          const file = join(dir, `${packet.chainId}-${attempt}.md`);
          await writeFile(file, `${repairMarkdown(packet)}\n`);
          return file;
        },
        async runAgent(repairFile) {
          const command = opts.agentCmd.split("{repair_file}").join(repairFile);
          say(`\nagent: ${command}`);
          try {
            const { stdout } = await run("/bin/sh", ["-c", command], { cwd, env: { ...env }, maxBuffer: 10_000_000 });
            const summary = from === "stdout" ? stdout : await readFile(join(cwd, from.slice(5)), "utf8");
            return { exitCode: 0, summary };
          } catch (error) {
            const code = typeof (error as { code?: unknown }).code === "number" ? ((error as { code: number }).code) : 1;
            return { exitCode: code, summary: null, detail: error instanceof Error ? error.message.split("\n")[0] ?? "" : "" };
          }
        },
        onAttempt(receipt, attempt) {
          say(`\n── attempt ${attempt}: ${receipt.overall} (chain ${receipt.chain.chainId}, ${receipt.chain.outcome}) ──`);
        },
      },
      initial,
      max,
    );
    const timeline = result.receipts.map((r) => r.overall).join(" → ");
    say(`\nchain ${result.chainId}: ${timeline} · ${result.outcome} · ${result.detail}`);
    return result.exitCode;
  } catch (error) {
    say(`nocap: ${error instanceof Error ? error.message : String(error)}`);
    return 2;
  }
}
