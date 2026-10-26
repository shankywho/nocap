/** `pnpm demo <scenario>`: build a scenario, show the agent's summary, narrate the check, print the receipt and repair. */
import { buildFixtures, SCENARIOS } from "./build-fixtures";
import { runScenario } from "./lib/run-scenario";
import { buildRepairPacket, NocapEvents, renderTerminal, repairMarkdown } from "@nocap/core";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function bubble(text: string): string {
  const lines = text.trim().split("\n");
  const width = Math.max(...lines.map((l) => l.length));
  const top = `╭${"─".repeat(width + 2)}╮`;
  const body = lines.map((l) => `│ ${l.padEnd(width)} │`);
  return ["agent says:", top, ...body, `╰${"─".repeat(width + 2)}╯`].join("\n");
}

async function main() {
  const scenario = process.argv[2] ?? "toothless";
  if (scenario === "loop" || scenario === "handoff") {
    console.error(`demo '${scenario}' needs the repair loop / ledger (not built yet).`);
    process.exit(2);
  }
  if (!(SCENARIOS as readonly string[]).includes(scenario)) {
    console.error(`unknown scenario '${scenario}'. Try: ${SCENARIOS.join(", ")}`);
    process.exit(2);
  }
  await buildFixtures({ scenarios: [scenario], quiet: true });
  const events = new NocapEvents();
  events.on((e) => {
    if (e.type === "step.end") console.log(`  ${e.status === "ok" ? "✓" : "-"} ${e.step.padEnd(8)} ${e.detail}`);
    if (e.type === "bitecheck") console.log(`    BITECHECK ${e.phase}: ${e.detail}`);
  });
  const first = await import("./lib/run-scenario").then((m) => m.readSummary(scenario));
  console.log(`\n${bubble(first)}\n`);
  await sleep(1000);
  console.log("nocap check --verbose\n");
  const { receipt } = await runScenario(scenario, { exec: true, events });
  console.log(`\n${renderTerminal(receipt, { color: process.stdout.isTTY === true && process.env.NO_COLOR === undefined })}\n`);
  if (receipt.totals.contradicted > 0) {
    console.log("nocap check --repair\n");
    console.log(repairMarkdown(buildRepairPacket(receipt.chain.chainId, receipt.chain.attempt, receipt.overall, receipt.claims)));
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
