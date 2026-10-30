import type { Evidence, Receipt } from "@nocap/core";

export const tone = {
  verified: "text-verified",
  contradicted: "text-contradicted",
  unverifiable: "text-unverifiable",
} as const;
export const glyph = { verified: "✓", contradicted: "✗", unverifiable: "!" } as const;
export const label = { verified: "VERIFIED", contradicted: "CONTRADICTED", unverifiable: "UNVERIFIABLE" } as const;

export function Badge({ overall }: { overall: Receipt["overall"] }) {
  const c = overall === "PASS" ? "text-verified" : overall === "FAIL" ? "text-contradicted" : "text-unverifiable";
  return <span className={`border border-brass bg-document px-2 py-0.5 font-mono text-xs font-semibold ${c}`} style={{ borderRadius: 2 }}>{overall}</span>;
}

export function Chip({ children }: { children: React.ReactNode }) {
  return <span className="rounded bg-surface px-1.5 py-0.5 font-mono text-xs text-muted ring-1 ring-hairline">{children}</span>;
}

export function EvidenceView({ e }: { e: Evidence }) {
  switch (e.kind) {
    case "file":
      return <Chip>{e.path} {e.status} +{e.additions} −{e.deletions}</Chip>;
    case "hunk":
      return (
        <pre className="overflow-x-auto rounded bg-surface p-2 text-xs ring-1 ring-hairline">
          <span className="text-muted">{e.path}:{e.startLine}{"\n"}</span>
          {e.lines.map((l, i) => (
            <span key={i} className={l.startsWith("+") ? "text-verified" : l.startsWith("-") ? "text-contradicted" : ""}>{l}{"\n"}</span>
          ))}
        </pre>
      );
    case "mapping":
      return <Chip>{e.concept} → {e.globs.join(", ")} ({e.matchedFiles} files)</Chip>;
    case "testRun":
      return <Chip>{e.label}: {e.passed}/{e.total} passed · {e.runner} · {(e.durationMs / 1000).toFixed(1)}s</Chip>;
    case "command":
      return <Chip>$ {e.command} → exit {e.exitCode}</Chip>;
    case "checkRuns":
      return <Chip>CI {e.success}/{e.total} green @ {e.sha.slice(0, 7)}</Chip>;
    case "note":
      return <span className="text-sm text-muted">{e.text}</span>;
  }
}

/** The agent's summary with each claim's span coloured by its verdict. */
export function HighlightedSummary({ r }: { r: Receipt }) {
  const spans = r.claims
    .flatMap((c) => (c.claim.span ? [{ s: c.claim.span[0], e: c.claim.span[1], id: c.claim.id, st: c.verdict.status }] : []))
    .sort((a, b) => a.s - b.s);
  const text = r.input.summary;
  const out: React.ReactNode[] = [];
  let at = 0;
  for (const sp of spans) {
    if (sp.s < at) continue;
    out.push(text.slice(at, sp.s));
    out.push(
      <a key={sp.id} href={`#${sp.id}`} className={`underline decoration-2 underline-offset-4 ${tone[sp.st]}`}>
        {text.slice(sp.s, sp.e)}
      </a>,
    );
    at = sp.e;
  }
  out.push(text.slice(at));
  return <p className="whitespace-pre-wrap rounded-lg bg-surface p-4 text-sm ring-1 ring-hairline">{out}</p>;
}
