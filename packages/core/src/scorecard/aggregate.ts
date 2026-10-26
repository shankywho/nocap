import type { Receipt } from "../schema/receipt.js";

export interface ScoreRow {
  agent: string;
  model: string | null;
  receipts: number;
  claims: number;
  verifiedPct: number | null;
  contradictedPct: number | null;
  unverifiablePct: number | null;
  biteRate: number | null;
  repairSuccess: number | null;
  avgAttemptsToResolve: number | null;
  silentDrops: number;
}

export const MIN_CLAIMS = 10;

const pct = (n: number, d: number) => (d === 0 ? null : Math.round((n / d) * 1000) / 10);

/** Per agent+model accuracy from receipts. Percentages need at least 10 claims; below that they are null ("n/a"). */
export function aggregate(receipts: Receipt[], minClaims = MIN_CLAIMS): ScoreRow[] {
  const groups = new Map<string, Receipt[]>();
  for (const r of receipts) {
    const key = `${r.actor.agent}\u0000${r.actor.model ?? ""}`;
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  const rows: ScoreRow[] = [];
  for (const rs of groups.values()) {
    const first = rs[0] as Receipt;
    const claims = rs.flatMap((r) => r.claims);
    const enough = claims.length >= minClaims;
    const count = (s: string) => claims.filter((c) => c.verdict.status === s).length;
    const tests = claims.filter((c) => c.claim.type === "tests_added" && c.verdict.bitecheck !== null);
    const bites = tests.filter((c) => c.verdict.bitecheck?.outcome === "bites").length;

    // Chains: group by chainId; one that contained a FAIL counts, and "resolved" means its last receipt did.
    const chains = new Map<string, Receipt[]>();
    for (const r of rs) chains.set(r.chain.chainId, [...(chains.get(r.chain.chainId) ?? []), r]);
    const failed = [...chains.values()].filter((c) => c.some((r) => r.overall === "FAIL"));
    const resolved = failed.filter((c) => [...c].sort((a, b) => a.chain.attempt - b.chain.attempt).at(-1)?.chain.outcome === "resolved");
    const attempts = resolved.map((c) => Math.max(...c.map((r) => r.chain.attempt)));

    rows.push({
      agent: first.actor.agent,
      model: first.actor.model,
      receipts: rs.length,
      claims: claims.length,
      verifiedPct: enough ? pct(count("verified"), claims.length) : null,
      contradictedPct: enough ? pct(count("contradicted"), claims.length) : null,
      unverifiablePct: enough ? pct(count("unverifiable"), claims.length) : null,
      biteRate: tests.length >= 1 && enough ? pct(bites, tests.length) : null,
      repairSuccess: failed.length >= 1 && enough ? pct(resolved.length, failed.length) : null,
      avgAttemptsToResolve: attempts.length > 0 ? Math.round((attempts.reduce((a, b) => a + b, 0) / attempts.length) * 10) / 10 : null,
      silentDrops: rs.flatMap((r) => r.chain.items).filter((i) => i.status === "dropped_silently").length,
    });
  }
  return rows.sort((a, b) => a.agent.localeCompare(b.agent) || (a.model ?? "").localeCompare(b.model ?? ""));
}

export const SCORECARD_CAPTION = "self-reported runs, not a model benchmark";

export function renderScorecard(rows: ScoreRow[]): string {
  if (rows.length === 0) return "No receipts yet. Run `nocap check` first.";
  const cell = (v: number | null, n: number) => (v === null ? `n/a (n=${n})` : `${v}%`);
  const head = ["agent", "model", "claims", "verified", "contradicted", "unverifiable", "bite rate", "repair success", "avg attempts", "silent drops"];
  const body = rows.map((r) => [
    r.agent, r.model ?? "-", String(r.claims), cell(r.verifiedPct, r.claims), cell(r.contradictedPct, r.claims), cell(r.unverifiablePct, r.claims),
    r.biteRate === null ? "n/a" : `${r.biteRate}%`, r.repairSuccess === null ? "n/a" : `${r.repairSuccess}%`,
    r.avgAttemptsToResolve === null ? "n/a" : String(r.avgAttemptsToResolve), String(r.silentDrops),
  ]);
  const widths = head.map((h, i) => Math.max(h.length, ...body.map((b) => (b[i] ?? "").length)));
  const fmt = (cols: string[]) => cols.map((c, i) => c.padEnd(widths[i] ?? 0)).join("  ").trimEnd();
  return [fmt(head), fmt(widths.map((w) => "-".repeat(w))), ...body.map(fmt), "", `(${SCORECARD_CAPTION})`].join("\n");
}
