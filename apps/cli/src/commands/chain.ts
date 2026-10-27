import { bitecheckLocal, listReceiptFiles, loadReceipt } from "@nocap/core/adapters";

export async function runBitecheck(files: string[], opts: { base?: string; cwd?: string }, env: NodeJS.ProcessEnv = process.env): Promise<number> {
  try {
    const r = await bitecheckLocal({ repoPath: opts.cwd ?? process.cwd(), testFiles: files, base: opts.base }, env);
    const note: Record<string, string> = {
      bites: "the tests fail without your source change: they exercise it",
      toothless: "the tests still pass with your source change reverted: they do not exercise it",
      import_only: "weak: the tests fail only because the module no longer imports",
      broken_on_head: "the selected tests fail on your current code",
      environment: "could not run here (or there is no source change to revert)",
      no_matching_tests: "none of the tests you added or changed matched those files",
    };
    process.stdout.write(`outcome=${r.outcome}${r.mode === "stub" ? " (stub)" : ""}  ${note[r.outcome] ?? ""}\n`);
    if (r.mode === "stub") process.stdout.write(`  stubbed to return undefined: ${r.stubbed.join(", ")}\n`);
    for (const t of r.selectedTests) process.stdout.write(`  ${t.file} › ${t.title}\n`);
    return r.outcome === "bites" || r.outcome === "import_only" ? 0 : 1;
  } catch (error) {
    process.stderr.write(`nocap: ${error instanceof Error ? error.message : String(error)}\n`);
    return 2;
  }
}

/** Timeline of one proof chain from the receipts saved in .nocap/receipts. */
export async function runChain(chainId: string | undefined, cwd = process.cwd()): Promise<number> {
  try {
    const receipts = await Promise.all((await listReceiptFiles(cwd)).map(loadReceipt));
    const id = chainId ?? receipts[receipts.length - 1]?.chain.chainId;
    if (!id) {
      process.stderr.write("nocap: no receipts found. Run `nocap check` first.\n");
      return 2;
    }
    const attempts = receipts.filter((r) => r.chain.chainId === id).sort((a, b) => a.chain.attempt - b.chain.attempt);
    if (attempts.length === 0) {
      process.stderr.write(`nocap: no receipts for chain ${id}.\n`);
      return 2;
    }
    const last = attempts[attempts.length - 1];
    process.stdout.write(`chain ${id}: ${attempts.map((r) => r.overall).join(" → ")} · ${last?.chain.outcome}\n`);
    for (const r of attempts) {
      process.stdout.write(`  attempt ${r.chain.attempt}  ${r.overall.padEnd(5)}  ${r.totals.verified}✓ ${r.totals.contradicted}✗ ${r.totals.unverifiable}!  receipt ${r.id}\n`);
    }
    for (const item of last?.chain.items ?? []) process.stdout.write(`  ${item.status.padEnd(20)} "${item.quote}"\n`);
    return 0;
  } catch (error) {
    process.stderr.write(`nocap: ${error instanceof Error ? error.message : String(error)}\n`);
    return 2;
  }
}
