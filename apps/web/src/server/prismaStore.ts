import { Receipt } from "@nocap/core";
import { headlineOf, type ReceiptStore, type StoredReceipt } from "./store";

type Row = {
  id: string;
  createdAt: Date;
  source: StoredReceipt["source"];
  isExample: boolean;
  headline: string;
  deleteTokenHash: string;
  payload: unknown;
};

/** The slice of the generated Prisma client this store uses, so the app compiles and tests without `prisma generate`. */
export interface PrismaLike {
  receipt: {
    upsert(args: { where: { id: string }; create: Record<string, unknown>; update: Record<string, unknown> }): Promise<unknown>;
    findUnique(args: { where: { id: string } }): Promise<Row | null>;
    delete(args: { where: { id: string } }): Promise<unknown>;
    findMany(args: { where?: Record<string, unknown>; orderBy?: Record<string, "asc" | "desc"> | Record<string, "asc" | "desc">[] }): Promise<Row[]>;
  };
}

const toStored = (row: Row): StoredReceipt => ({
  id: row.id,
  createdAt: row.createdAt.toISOString(),
  source: row.source,
  isExample: row.isExample,
  headline: row.headline,
  deleteTokenHash: row.deleteTokenHash,
  receipt: Receipt.parse(row.payload),
});

/** Postgres-backed store (schema: prisma/schema.prisma). The receipt payload is validated again on read. */
export class PrismaStore implements ReceiptStore {
  constructor(private readonly db: PrismaLike) {}

  async put(r: StoredReceipt) {
    const rc = r.receipt;
    const data = {
      createdAt: new Date(r.createdAt),
      schemaVersion: rc.schemaVersion,
      source: r.source,
      agent: rc.actor.agent,
      repo: rc.input.repo,
      prNumber: rc.input.pr,
      baseSha: rc.input.base,
      headSha: rc.input.head,
      overall: rc.overall,
      verifiedCount: rc.totals.verified,
      contradictedCount: rc.totals.contradicted,
      unverifiableCount: rc.totals.unverifiable,
      flagCount: rc.totals.flags,
      headline: r.headline || headlineOf(rc),
      modelLabel: rc.model ? `${rc.model.id}@${rc.model.provider}` : "offline",
      payload: rc,
      deleteTokenHash: r.deleteTokenHash,
      isExample: r.isExample,
      chainId: rc.chain.chainId,
      parentId: rc.chain.parentId,
      attempt: rc.chain.attempt,
      actorRole: rc.actor.role,
    };
    await this.db.receipt.upsert({ where: { id: r.id }, create: { id: r.id, ...data }, update: data });
  }

  async get(id: string) {
    const row = await this.db.receipt.findUnique({ where: { id } });
    return row ? toStored(row) : null;
  }

  async remove(id: string) {
    try {
      await this.db.receipt.delete({ where: { id } });
      return true;
    } catch {
      return false;
    }
  }

  async examples() {
    return (await this.db.receipt.findMany({ where: { isExample: true }, orderBy: { createdAt: "asc" } })).map(toStored);
  }

  async chain(chainId: string) {
    return (await this.db.receipt.findMany({ where: { chainId }, orderBy: { attempt: "asc" } })).map(toStored);
  }

  async published() {
    return (await this.db.receipt.findMany({ where: { isExample: false }, orderBy: { createdAt: "asc" } })).map(toStored);
  }
}
