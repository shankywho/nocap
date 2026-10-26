import { createHash, randomBytes } from "node:crypto";
import type { Receipt } from "@nocap/core";

export interface StoredReceipt {
  id: string;
  createdAt: string;
  source: "CLI" | "PR" | "MCP" | "HOOK" | "DEMO";
  isExample: boolean;
  headline: string;
  deleteTokenHash: string;
  receipt: Receipt;
}

export interface ReceiptStore {
  put(r: StoredReceipt): Promise<void>;
  get(id: string): Promise<StoredReceipt | null>;
  remove(id: string): Promise<boolean>;
  examples(): Promise<StoredReceipt[]>;
  chain(chainId: string): Promise<StoredReceipt[]>;
  published(): Promise<StoredReceipt[]>;
}

/** In-memory store used for mock mode and tests. Same interface a Prisma store implements. */
export class MemoryStore implements ReceiptStore {
  private rows = new Map<string, StoredReceipt>();
  async put(r: StoredReceipt) {
    this.rows.set(r.id, r);
  }
  async get(id: string) {
    return this.rows.get(id) ?? null;
  }
  async remove(id: string) {
    return this.rows.delete(id);
  }
  private all() {
    return [...this.rows.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }
  async examples() {
    return this.all().filter((r) => r.isExample);
  }
  async chain(chainId: string) {
    return this.all()
      .filter((r) => r.receipt.chain.chainId === chainId)
      .sort((a, b) => a.receipt.chain.attempt - b.receipt.chain.attempt);
  }
  async published() {
    return this.all().filter((r) => !r.isExample);
  }
}

const g = globalThis as unknown as { __nocapStore?: ReceiptStore };
export function getStore(): ReceiptStore {
  return (g.__nocapStore ??= new MemoryStore());
}
export function setStore(s: ReceiptStore) {
  g.__nocapStore = s;
}

export const newId = () => randomBytes(8).toString("base64url").slice(0, 10);
export const hashToken = (t: string) => createHash("sha256").update(t).digest("hex");

export function headlineOf(r: Receipt): string {
  const bad = r.claims.find((c) => c.verdict.status === "contradicted");
  const text = bad ? `✗ ${bad.claim.quote}` : `${r.totals.verified} claims verified`;
  return text.slice(0, 140);
}
