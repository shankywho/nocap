import type { FsPort } from "../ports.js";
import type { Claim } from "../schema/claim.js";
import type { Receipt } from "../schema/receipt.js";

export interface LedgerEntry {
  ts: string;
  chainId: string;
  receiptId: string;
  actor: { agent: string; model: string | null; role: string | null };
  type: Claim["type"];
  quote: string;
  subject: string | null;
  paths: string[];
  symbols: string[];
  status: "verified" | "contradicted" | "unverifiable";
  reason: string;
  headSha: string;
  /** The commit the work sits on: the snapshot's parent for uncommitted work, else the head. */
  anchorSha: string;
  /** Git blob sha of each tracked file at head (null = absent). */
  blobs: Record<string, string | null>;
}

const norm = (s: string) => s.trim().toLowerCase();

/** Fact key: type + (symbols ∪ paths ∪ subject). The latest entry per key wins. */
export function factKey(e: Pick<LedgerEntry, "type" | "symbols" | "paths" | "subject">): string {
  const parts = [...e.symbols, ...e.paths, ...(e.subject ? [e.subject] : [])].map(norm).filter(Boolean);
  return `${e.type}|${[...new Set(parts)].sort().join(",")}`;
}

/** Files whose content a claim's verdict depends on. */
export function trackedPaths(receipt: Receipt, index: number): string[] {
  const item = receipt.claims[index];
  if (!item) return [];
  const out = new Set<string>(item.claim.paths);
  for (const e of item.verdict.evidence) if ("path" in e) out.add(e.path);
  for (const t of item.verdict.bitecheck?.selectedTests ?? []) out.add(t.file);
  for (const p of item.verdict.bitecheck?.revertedFiles ?? []) out.add(p);
  for (const p of item.verdict.bitecheck?.deletedForRevert ?? []) out.add(p);
  for (const s of item.verdict.bitecheck?.stubbed ?? []) out.add(s.split(" › ")[0] as string);
  return [...out];
}

export function entriesFromReceipt(receipt: Receipt, anchorSha: string, blobs: (paths: string[]) => Record<string, string | null>): LedgerEntry[] {
  return receipt.claims
    .map((c, i) => ({ c, i }))
    .filter(({ c }) => c.claim.type !== "other")
    .map(({ c, i }) => ({
      ts: receipt.createdAt,
      chainId: receipt.chain.chainId,
      receiptId: receipt.id,
      actor: receipt.actor,
      type: c.claim.type,
      quote: c.claim.quote,
      subject: c.claim.subject,
      paths: c.claim.paths,
      symbols: c.claim.symbols,
      status: c.verdict.status,
      reason: c.verdict.reason,
      headSha: receipt.input.head,
      anchorSha,
      blobs: blobs(trackedPaths(receipt, i)),
    }));
}

/** Append-only JSONL, one line per claim verdict. */
export class Ledger {
  constructor(
    private readonly fs: FsPort,
    private readonly file: string,
  ) {}

  async append(entries: LedgerEntry[]): Promise<void> {
    if (entries.length === 0) return;
    await this.fs.mkdir(this.file.slice(0, this.file.lastIndexOf("/")));
    await this.fs.appendFile(this.file, `${entries.map((e) => JSON.stringify(e)).join("\n")}\n`);
  }

  async read(): Promise<LedgerEntry[]> {
    if (!(await this.fs.exists(this.file))) return [];
    const out: LedgerEntry[] = [];
    for (const line of (await this.fs.readFile(this.file)).split("\n")) {
      if (!line.trim()) continue;
      try {
        out.push(JSON.parse(line) as LedgerEntry);
      } catch {
        // skip a torn line rather than losing the whole ledger
      }
    }
    return out;
  }

  /** Latest entry per fact key. */
  async latestFacts(): Promise<LedgerEntry[]> {
    const map = new Map<string, LedgerEntry>();
    for (const e of await this.read()) map.set(factKey(e), e);
    return [...map.values()];
  }
}
