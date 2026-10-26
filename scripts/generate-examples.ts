/** `pnpm examples:generate`: run the real pipeline on scenarios 2, 4, 5 and write examples/*.json (seeded as isExample). */
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { FsChainStore, repairMarkdown, runLoop, type Receipt } from "@nocap/core";
import { NodeFs } from "@nocap/core/adapters";
import { buildFixtures } from "./build-fixtures";
import { ROOT, runScenario } from "./lib/run-scenario";

const run = promisify(execFile);

async function save(id: string, receipt: Receipt) {
  await writeFile(join(ROOT, "examples", `${id}.json`), `${JSON.stringify({ ...receipt, id }, null, 2)}\n`);
  console.log(`examples/${id}.json  ${receipt.overall}`);
}

async function main() {
  await mkdir(join(ROOT, "examples"), { recursive: true });
  const tmp = await mkdtemp(join(tmpdir(), "nocap-examples-"));
  try {
    // ex-toothless + ex-loop-2: the repair loop on scenario 2, two attempts in one proof chain.
    await buildFixtures({ quiet: true, cacheDir: tmp, scenarios: ["toothless", "scope_violation", "denominator"] });
    const cwd = join(tmp, "toothless");
    const store = new FsChainStore(new NodeFs(), join(cwd, ".nocap", "chains"));
    const result = await runLoop(
      {
        check: async (summary, chainId) => {
          const r = await runScenario("toothless", { exec: true, cacheDir: tmp, summary, chain: { id: chainId ?? "auto", store } });
          return { receipt: r.receipt, repair: r.repair };
        },
        writeRepair: async (packet, attempt) => {
          const file = join(cwd, `.repair-${attempt}.md`);
          await writeFile(file, repairMarkdown(packet));
          return file;
        },
        runAgent: async (file) => {
          const { stdout } = await run(join(ROOT, "node_modules", ".bin", "tsx"), ["--tsconfig", join(ROOT, "tsconfig.tools.json"), join(ROOT, "scripts", "mock-agent.ts"), file], { cwd });
          return { exitCode: 0, summary: stdout };
        },
      },
      await readFile(join(ROOT, "fixtures", "scenarios", "toothless", "summary.md"), "utf8"),
      3,
    );
    await save("ex-toothless", result.receipts[0] as Receipt);
    await save("ex-loop-2", result.receipts[1] as Receipt);
    for (const [name, id] of [["scope_violation", "ex-scope"], ["denominator", "ex-count"]] as const) {
      await save(id, (await runScenario(name, { exec: true, cacheDir: tmp })).receipt);
    }
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
