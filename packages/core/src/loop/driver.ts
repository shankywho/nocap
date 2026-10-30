import type { RepairPacket } from "../policy/repair.js";
import type { Receipt } from "../schema/receipt.js";

export type StopReason = "resolved" | "max_attempts" | "no_progress" | "agent_failed";

export interface LoopDeps {
  /** Verify a summary; the driver passes the chain id of attempt 1 on later attempts. */
  check(summary: string, chainId: string | null): Promise<{ receipt: Receipt; repair: RepairPacket | null }>;
  /** Persist the repair packet where the agent command can read it; returns the file path. */
  writeRepair(packet: RepairPacket, attempt: number): Promise<string>;
  /** Run the agent with the repair file. `summary` is its next final message (null if it printed none). */
  runAgent(repairFile: string): Promise<{ exitCode: number; summary: string | null; detail?: string }>;
  onAttempt?(receipt: Receipt, attempt: number): void;
}

export interface LoopResult {
  receipts: Receipt[];
  stopReason: StopReason;
  detail: string;
  chainId: string;
  outcome: Receipt["chain"]["outcome"];
  /** 0 when the chain resolved without a FAIL; 1 otherwise. */
  exitCode: number;
}

const openKeys = (r: Receipt) =>
  r.chain.items.filter((i) => i.status !== "fixed" && i.status !== "retracted").map((i) => i.key).sort();

/**
 * check -> repair file -> agent command -> re-check, until the chain resolves, attempts run out,
 * the same items stay open on two consecutive attempts, or the agent command fails.
 */
export async function runLoop(deps: LoopDeps, initialSummary: string, maxAttempts = 3): Promise<LoopResult> {
  const receipts: Receipt[] = [];
  let summary = initialSummary;
  let chainId: string | null = null;
  let previous: string[] | null = null;

  const finish = (stopReason: StopReason, detail: string): LoopResult => {
    const last = receipts[receipts.length - 1] as Receipt;
    const resolved = openKeys(last).length === 0;
    return {
      receipts, stopReason, detail, chainId: last.chain.chainId, outcome: last.chain.outcome,
      exitCode: resolved && last.overall !== "FAIL" ? 0 : 1,
    };
  };

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const { receipt, repair } = await deps.check(summary, chainId);
    receipts.push(receipt);
    chainId = receipt.chain.chainId;
    deps.onAttempt?.(receipt, attempt);

    const open = openKeys(receipt);
    if (open.length === 0 && receipt.overall !== "FAIL") return finish("resolved", `resolved after ${attempt} attempt(s)`);
    if (previous && open.join("|") === previous.join("|")) return finish("no_progress", `no progress: the same item(s) stayed open on attempts ${attempt - 1} and ${attempt}`);
    if (attempt === maxAttempts) return finish("max_attempts", `reached the maximum of ${maxAttempts} attempts`);
    previous = open;

    if (!repair) return finish("resolved", "nothing to repair");
    const file = await deps.writeRepair(repair, attempt);
    const agent = await deps.runAgent(file);
    if (agent.exitCode !== 0) return finish("agent_failed", `agent command exited ${agent.exitCode}${agent.detail ? `: ${agent.detail}` : ""}`);
    if (agent.summary === null || agent.summary.trim() === "") return finish("agent_failed", "the agent printed no summary");
    summary = agent.summary;
  }
  return finish("max_attempts", "unreachable");
}
