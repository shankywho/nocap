import { NextResponse } from "next/server";
import { getStore } from "../../../src/server/store";

export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await getStore().examples();
  return NextResponse.json(rows.map((r) => ({ id: r.id, headline: r.headline, overall: r.receipt.overall, chainId: r.receipt.chain.chainId, totals: r.receipt.totals })));
}
