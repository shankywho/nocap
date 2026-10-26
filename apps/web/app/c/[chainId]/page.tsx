import { notFound } from "next/navigation";
import { getStore } from "../../../src/server/store";
import { Badge, Chip } from "../../../src/ui/parts";

export const dynamic = "force-dynamic";
const ITEM_TONE: Record<string, string> = { open: "text-contradicted", fixed: "text-verified", retracted: "text-verified", dropped_silently: "text-contradicted", repair_by_weakening: "text-contradicted" };

export default async function ChainPage({ params }: { params: Promise<{ chainId: string }> }) {
  const rows = await getStore().chain((await params).chainId);
  if (rows.length === 0) notFound();
  const receipts = rows.map((r) => r.receipt);
  const last = receipts[receipts.length - 1]!;
  const arrow = receipts.map((r) => r.overall).join(" → ");
  return (
    <main className="mx-auto max-w-4xl space-y-6 px-6 py-10">
      <p className="font-mono text-sm text-accent">NOCAP · proof chain {last.chain.chainId}</p>
      <h1 className="text-3xl font-semibold tracking-tight">{arrow} in {receipts.length} attempt{receipts.length === 1 ? "" : "s"}</h1>
      <p className="font-mono text-sm text-muted">outcome: {last.chain.outcome}</p>
      <ol className="grid gap-4 sm:grid-cols-2">
        {rows.map((row) => (
          <li key={row.id} className="space-y-2 rounded-lg bg-surface p-4 ring-1 ring-hairline">
            <div className="flex items-center gap-2"><Badge overall={row.receipt.overall} /><span className="font-mono text-sm">attempt {row.receipt.chain.attempt}</span></div>
            <p className="text-sm text-muted">{row.headline}</p>
            <a className="font-mono text-xs underline" href={`/r/${row.id}`}>open receipt</a>
          </li>
        ))}
      </ol>
      <section className="space-y-2">
        <h2 className="font-mono text-sm text-muted">ITEM TIMELINE</h2>
        <ul className="space-y-2">
          {last.chain.items.map((i) => (
            <li key={i.key} className="text-sm">
              <span className={`font-mono ${ITEM_TONE[i.status] ?? ""}`}>{i.status}</span> “{i.quote}”{" "}
              <Chip>from attempt {i.sinceAttempt}{i.resolvedAttempt ? ` · resolved in ${i.resolvedAttempt}` : ""}</Chip>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
