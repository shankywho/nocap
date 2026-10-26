import { appendFile, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Receipt, renderMarkdown } from "@nocap/core";

/** Saves .nocap/receipts/<id>.{json,md}; hides .nocap via .git/info/exclude, never .gitignore. */
export async function saveReceipt(repoRoot: string, receipt: Receipt): Promise<string> {
  const dir = join(repoRoot, ".nocap", "receipts");
  await mkdir(dir, { recursive: true });
  const file = join(dir, `${receipt.id}.json`);
  await writeFile(file, `${JSON.stringify(receipt, null, 2)}\n`);
  await writeFile(join(dir, `${receipt.id}.md`), `${renderMarkdown(receipt)}\n`);
  await excludeNocap(repoRoot);
  return file;
}

async function excludeNocap(repoRoot: string): Promise<void> {
  const info = join(repoRoot, ".git", "info");
  try {
    await mkdir(info, { recursive: true });
    const path = join(info, "exclude");
    const current = await readFile(path, "utf8").catch(() => "");
    if (!current.split("\n").some((l) => l.trim() === ".nocap/")) {
      await appendFile(path, `${current.endsWith("\n") || current === "" ? "" : "\n"}.nocap/\n`);
    }
  } catch {
    // not a plain checkout (worktree or bare); skip silently
  }
}

export async function loadReceipt(file: string): Promise<Receipt> {
  return Receipt.parse(JSON.parse(await readFile(file, "utf8")));
}

export async function latestReceiptFile(repoRoot: string): Promise<string | null> {
  const dir = join(repoRoot, ".nocap", "receipts");
  const names = (await readdir(dir).catch(() => [] as string[])).filter((n) => n.endsWith(".json"));
  if (names.length === 0) return null;
  const withTimes = await Promise.all(
    names.map(async (n) => ({ n, t: (JSON.parse(await readFile(join(dir, n), "utf8")) as { createdAt?: string }).createdAt ?? "" })),
  );
  withTimes.sort((a, b) => a.t.localeCompare(b.t) || a.n.localeCompare(b.n));
  return join(dir, withTimes[withTimes.length - 1]?.n ?? "");
}
