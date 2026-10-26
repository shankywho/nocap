import { getStore } from "../../../src/server/store";
import { chainCard, OG_SIZE, OG_TYPE, ogCard } from "../../../src/server/og";

export const dynamic = "force-dynamic";
export const size = OG_SIZE;
export const contentType = OG_TYPE;

export default async function Image({ params }: { params: Promise<{ chainId: string }> }) {
  const rows = await getStore().chain((await params).chainId);
  return rows.length ? chainCard(rows.map((r) => r.receipt)) : ogCard({ kicker: "NOT FOUND", title: "No such chain", line: "", overall: "MIXED", foot: "nocap" });
}
