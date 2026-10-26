import { notFound } from "next/navigation";
import { getStore } from "../../../src/server/store";
import { Badge, Chip, EvidenceView, glyph, HighlightedSummary, label, tone } from "../../../src/ui/parts";

export const dynamic = "force-dynamic";
const TABS = ["claims", "undisclosed", "flags", "trace", "raw"] as const;

export default async function ReceiptPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const row = await getStore().get((await params).id);
  if (!row) notFound();
  const r = row.receipt;
  const wanted = (await searchParams).tab;
  const tab = TABS.find((t) => t === wanted) ?? "claims";
  const flags = [...r.globalFlags, ...r.claims.flatMap((c) => c.verdict.flags)];
  return (
    <main className="mx-auto max-w-4xl space-y-6 px-6 py-10">
      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-3">
          <p className="font-mono text-sm text-accent">NOCAP · receipt {r.id}</p>
          <Badge overall={r.overall} />
          {row.isExample && <Chip>example</Chip>}
        </div>
        <p className="font-mono text-sm text-muted">
          {r.totals.verified} verified · {r.totals.contradicted} contradicted · {r.totals.unverifiable} unverifiable · agent {r.actor.agent}
          {r.model ? ` · ${r.model.id}@${r.model.provider}` : " · offline"} · {r.createdAt}
        </p>
        <p className="font-mono text-xs text-muted">
          <a className="underline" href={`/r/${r.id}/raw`}>raw markdown</a> ·{" "}
          <a className="underline" href={`/c/${r.chain.chainId}`}>proof chain (attempt {r.chain.attempt})</a>
        </p>
      </header>
      <HighlightedSummary r={r} />
      <nav className="flex gap-4 border-b border-hairline font-mono text-sm">
        {TABS.map((t) => (
          <a key={t} href={`?tab=${t}`} className={`pb-2 ${t === tab ? "border-b-2 border-accent text-foreground" : "text-muted"}`}>{t}</a>
        ))}
      </nav>
      {tab === "claims" && (
        <ul className="space-y-4">
          {r.claims.map(({ claim, verdict }) => (
            <li key={claim.id} id={claim.id} className="space-y-2 rounded-lg bg-surface p-4 ring-1 ring-hairline">
              <p className={`font-mono text-sm font-semibold ${tone[verdict.status]}`}>{glyph[verdict.status]} {label[verdict.status]}</p>
              <p>“{claim.quote}”</p>
              <p className="text-sm text-muted">{verdict.reason}</p>
              {verdict.bitecheck && (
                <p className="font-mono text-xs text-muted">BITECHECK {verdict.bitecheck.outcome} · reverted {verdict.bitecheck.revertedFiles.join(", ") || "nothing"}</p>
              )}
              <div className="flex flex-wrap gap-2">{verdict.evidence.map((e, i) => <EvidenceView key={i} e={e} />)}</div>
            </li>
          ))}
        </ul>
      )}
      {tab === "undisclosed" && (
        <ul className="space-y-2">{r.undisclosed.length === 0 ? <li className="text-muted">None.</li> : r.undisclosed.map((e, i) => <li key={i}><EvidenceView e={e} /></li>)}</ul>
      )}
      {tab === "flags" && (
        <ul className="space-y-2 text-sm">{flags.length === 0 ? <li className="text-muted">None.</li> : flags.map((f, i) => <li key={i}><Chip>{f.severity}</Chip> <b>{f.rule}</b> {f.path}{f.line ? `:${f.line}` : ""} — {f.detail}</li>)}</ul>
      )}
      {tab === "trace" && (
        <table className="w-full font-mono text-sm">
          <tbody>
            {r.trace.map((s, i) => (
              <tr key={i} className="border-b border-hairline"><td className="py-1">{s.step}</td><td className="text-muted">{s.status}</td><td className="text-right text-muted">{s.ms}ms</td><td className="pl-4 text-muted">{s.detail}</td></tr>
            ))}
          </tbody>
        </table>
      )}
      {tab === "raw" && <pre className="overflow-x-auto rounded-lg bg-surface p-4 text-xs ring-1 ring-hairline">{JSON.stringify(r, null, 2)}</pre>}
    </main>
  );
}
