import { aggregate, SCORECARD_CAPTION } from "@nocap/core";
import { getStore } from "../../src/server/store";

export const dynamic = "force-dynamic";
const f = (v: number | null, n: number, suffix = "%") => (v === null ? `n/a (n=${n})` : `${v}${suffix}`);

export default async function AgentsPage() {
  const rows = aggregate((await getStore().published()).map((r) => r.receipt));
  return (
    <main className="mx-auto max-w-5xl space-y-6 px-6 py-10">
      <p className="font-mono text-sm text-accent">NOCAP · agents</p>
      <h1 className="text-3xl font-semibold tracking-tight">Per-agent accuracy</h1>
      <p className="text-sm text-muted">{SCORECARD_CAPTION}. Percentages appear after 10 claims.</p>
      {rows.length === 0 ? (
        <p className="text-muted">No published receipts yet.</p>
      ) : (
        <table className="w-full font-mono text-sm">
          <thead className="text-left text-muted"><tr><th>agent</th><th>model</th><th>claims</th><th>verified</th><th>contradicted</th><th>unverifiable</th><th>bite rate</th><th>repair</th><th>drops</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={`${r.agent}/${r.model}`} className="border-t border-hairline">
                <td>{r.agent}</td><td>{r.model ?? "–"}</td><td>{r.claims}</td>
                <td>{f(r.verifiedPct, r.claims)}</td><td>{f(r.contradictedPct, r.claims)}</td><td>{f(r.unverifiablePct, r.claims)}</td>
                <td>{f(r.biteRate, r.claims)}</td><td>{f(r.repairSuccess, r.claims)}</td><td>{r.silentDrops}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
