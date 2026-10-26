import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { buildRepairPacket, renderMarkdown, repairMarkdown, Receipt } from "@nocap/core";
import { bitecheckLocal, checkScopeLocal, latestReceiptFile, loadReceipt, verifyLocal, type Env } from "@nocap/core/adapters";

export interface ToolResult {
  [key: string]: unknown;
  content: { type: "text"; text: string }[];
  isError?: boolean;
}

const text = (t: string) => ({ type: "text" as const, text: t });
const result = (markdown: string, json: unknown): ToolResult => ({ content: [text(markdown), text(JSON.stringify(json, null, 2))] });
const failure = (reason: string): ToolResult => ({ content: [text(`nocap could not verify: ${reason}`)], isError: true });

/** Never throws out of a handler. */
async function guard(fn: () => Promise<ToolResult>): Promise<ToolResult> {
  try {
    return await fn();
  } catch (error) {
    return failure(error instanceof Error ? error.message : String(error));
  }
}

export function alanStatus(overall: Receipt["overall"]): "pass" | "fail" | "mixed" {
  return overall === "PASS" ? "pass" : overall === "FAIL" ? "fail" : "mixed";
}

export interface VerifyArgs {
  summary: string;
  repo_path: string;
  base?: string | undefined;
  exec?: boolean | undefined;
  chain?: string | undefined;
  actor?: string | undefined;
  model?: string | undefined;
  role?: string | undefined;
}

export function verifyClaims(args: VerifyArgs, env: Env): Promise<ToolResult> {
  return guard(async () => {
    const { receipt, repair } = await verifyLocal(
      {
        repoPath: args.repo_path, summary: args.summary, base: args.base, exec: args.exec, chain: args.chain ?? "auto",
        actor: args.actor, model: args.model, role: args.role, agent: args.actor ?? "mcp-agent",
      },
      env,
    );
    const markdown = renderMarkdown(receipt);
    return result(markdown, {
      status: alanStatus(receipt.overall),
      title: `nocap: ${receipt.overall}`,
      receiptId: receipt.id,
      totals: receipt.totals,
      chain: { chainId: receipt.chain.chainId, attempt: receipt.chain.attempt, outcome: receipt.chain.outcome, items: receipt.chain.items },
      repairAvailable: repair !== null && repair.items.length > 0,
      evidence: markdown,
    });
  });
}

async function newestChainReceipt(repoPath: string): Promise<Receipt | null> {
  const dir = join(repoPath, ".nocap", "chains");
  const names = (await readdir(dir).catch(() => [] as string[])).filter((n) => n.endsWith(".json"));
  let best: Receipt | null = null;
  for (const n of names) {
    const r = Receipt.safeParse(JSON.parse(await readFile(join(dir, n), "utf8")));
    if (r.success && (best === null || r.data.createdAt > best.createdAt)) best = r.data;
  }
  return best;
}

export function getRepair(args: { repo_path: string; receipt_id?: string | undefined }): Promise<ToolResult> {
  return guard(async () => {
    let receipt: Receipt | null;
    if (args.receipt_id) {
      receipt = await loadReceipt(join(args.repo_path, ".nocap", "receipts", `${args.receipt_id}.json`)).catch(() => null);
    } else {
      receipt = (await newestChainReceipt(args.repo_path)) ?? (await latestReceiptFile(args.repo_path).then((f) => (f ? loadReceipt(f) : null)));
    }
    if (!receipt) return failure("no receipt found. Call verify_claims first.");
    const packet = buildRepairPacket(receipt.chain.chainId, receipt.chain.attempt, receipt.overall, receipt.claims, receipt.chain.items);
    if (packet.items.length === 0) return result("Nothing to repair: no open items.", { items: [], rules: packet.rules });
    return result(repairMarkdown(packet), packet);
  });
}

export function bitecheck(args: { repo_path: string; test_files: string[]; base?: string | undefined }, env: Env): Promise<ToolResult> {
  return guard(async () => {
    const r = await bitecheckLocal({ repoPath: args.repo_path, testFiles: args.test_files, base: args.base }, env);
    const line: Record<string, string> = {
      bites: "BITES: the tests fail when your source change is reverted, so they exercise it.",
      toothless: "TOOTHLESS: the tests still pass with your source change reverted, so they do not exercise it. Add assertions that depend on the new behaviour.",
      import_only: "WEAK: the tests fail only because the module no longer imports. Add behavioural assertions.",
      broken_on_head: "BROKEN: the selected tests fail on your current code.",
      environment: "COULD NOT RUN: the tests could not be executed here (or there is no source change to revert).",
      no_matching_tests: "NO MATCHING TESTS: none of the tests you added or changed matched those files.",
    };
    return result(`${line[r.outcome] ?? r.outcome}\n\nSelected: ${r.selectedTests.map((t) => `${t.file} › ${t.title}`).join("; ") || "none"}`, r);
  });
}

export function checkScope(args: { repo_path: string; concept: string; base?: string | undefined }, env: Env): Promise<ToolResult> {
  return guard(async () => {
    const r = await checkScopeLocal({ repoPath: args.repo_path, concept: args.concept, base: args.base }, env);
    const md =
      r.mappedFiles.length === 0
        ? `Could not map '${r.concept}' to any file.`
        : r.touched.length === 0
          ? `'${r.concept}' (${r.globs.join(", ")}) is untouched.`
          : `'${r.concept}' (${r.globs.join(", ")}) was touched:\n${r.touched.map((f) => `- ${f.path}  ${f.status} +${f.additions} −${f.deletions}`).join("\n")}`;
    return result(md, r);
  });
}
