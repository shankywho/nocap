import { NextResponse } from "next/server";
import { fail } from "../../../../src/server/api";
import { getStore } from "../../../../src/server/store";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ chainId: string }> }) {
  const rows = await getStore().chain((await params).chainId);
  if (rows.length === 0) return fail("NOT_FOUND", "No such chain.");
  const receipts = rows.map((r) => r.receipt);
  const last = receipts[receipts.length - 1]!;
  return NextResponse.json({ chainId: last.chain.chainId, outcome: last.chain.outcome, receipts, items: last.chain.items });
}
