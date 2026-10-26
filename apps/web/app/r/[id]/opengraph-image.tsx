import { getStore } from "../../../src/server/store";
import { OG_SIZE, OG_TYPE, ogCard, receiptCard } from "../../../src/server/og";

export const dynamic = "force-dynamic";
export const size = OG_SIZE;
export const contentType = OG_TYPE;

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const row = await getStore().get((await params).id);
  return row ? receiptCard(row.receipt) : ogCard({ kicker: "NOT FOUND", title: "No such receipt", line: "", overall: "MIXED", foot: "nocap" });
}
