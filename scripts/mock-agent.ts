/**
 * Scripted "agent" for tests and the demo: `tsx scripts/mock-agent.ts <repair_file>`.
 * It runs in the scenario repo (cwd = .cache/fixtures/<name>), applies
 * fixtures/scenarios/<name>/repair/{overlay,delete.txt} to the working tree and prints
 * repair/summary.md to stdout. Anything other than a scripted scenario changes nothing.
 */
import { cp, readFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));

async function main() {
  const repairFile = process.argv[2];
  if (!repairFile || !existsSync(repairFile)) {
    console.error("mock-agent: repair file not found");
    process.exit(2);
  }
  const chain = /chain ([0-9a-f]+)/.exec(await readFile(repairFile, "utf8"))?.[1] ?? "unknown";
  const name = basename(process.cwd());
  const dir = join(root, "fixtures", "scenarios", name, "repair");
  console.error(`mock-agent: chain ${chain}, scenario ${name}`);
  if (!existsSync(dir)) {
    console.error(`mock-agent: no scripted repair for '${name}'`);
    process.exit(0);
  }
  const overlay = join(dir, "overlay");
  if (existsSync(overlay)) await cp(overlay, process.cwd(), { recursive: true, filter: (src) => !src.endsWith(".gitkeep") });
  const deleteList = join(dir, "delete.txt");
  if (existsSync(deleteList)) {
    for (const line of (await readFile(deleteList, "utf8")).split("\n").map((l) => l.trim()).filter(Boolean)) {
      await rm(join(process.cwd(), line), { force: true });
    }
  }
  process.stdout.write(await readFile(join(dir, "summary.md"), "utf8"));
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
