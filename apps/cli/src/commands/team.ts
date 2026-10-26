import { ledgerFactsLocal, scorecardLocal } from "@nocap/core/adapters";
import { renderScorecard } from "@nocap/core";

export async function runHandoff(to: string | undefined, cwd = process.cwd()): Promise<number> {
  try {
    const f = await ledgerFactsLocal({ repoPath: cwd });
    process.stdout.write(`${to ? `# Handoff for ${to}\n\n` : ""}${f.markdown}\n`);
    return 0;
  } catch (error) {
    process.stderr.write(`nocap: ${error instanceof Error ? error.message : String(error)}\n`);
    return 2;
  }
}

export async function runScorecard(cwd = process.cwd()): Promise<number> {
  try {
    process.stdout.write(`${renderScorecard(await scorecardLocal(cwd))}\n`);
    return 0;
  } catch (error) {
    process.stderr.write(`nocap: ${error instanceof Error ? error.message : String(error)}\n`);
    return 2;
  }
}
