import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import type { Receipt } from "@nocap/core";

export const OG_SIZE = { width: 1200, height: 630 };
export const OG_TYPE = "image/png";

async function font() {
  const dir = join(process.cwd(), "node_modules", "geist", "dist", "fonts", "geist-mono");
  return readFile(join(dir, "GeistMono-SemiBold.ttf")).catch(() => null);
}

const COLOR = { PASS: "#3fb950", FAIL: "#f85149", MIXED: "#d29922" } as const;

export async function ogCard(args: { kicker: string; title: string; line: string; overall: Receipt["overall"]; foot: string }) {
  const data = await font();
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 64, background: "radial-gradient(circle at 80% 0%, rgba(62,224,207,0.22), #08090a 55%)", color: "#f2f4f5", fontFamily: "Geist Mono" }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 34 }}>
          <span style={{ color: "#3ee0cf" }}>NOCAP</span>
          <span style={{ color: COLOR[args.overall] }}>{args.kicker}</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div style={{ fontSize: 64, lineHeight: 1.1 }}>{args.title}</div>
          <div style={{ fontSize: 30, color: "#8b949e" }}>{args.line}</div>
        </div>
        <div style={{ fontSize: 26, color: "#8b949e" }}>{args.foot}</div>
      </div>
    ),
    { ...OG_SIZE, ...(data ? { fonts: [{ name: "Geist Mono", data, weight: 600 as const, style: "normal" as const }] } : {}) },
  );
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

export function receiptCard(r: Receipt) {
  const bad = r.claims.find((c) => c.verdict.status === "contradicted");
  return ogCard({
    kicker: r.overall,
    title: bad ? `CONTRADICTED: ${clip(bad.claim.quote, 90)}` : `${r.totals.verified} claims verified`,
    line: `${r.claims.length} claims · ${r.totals.verified} verified · ${r.totals.contradicted} contradicted · ${r.totals.unverifiable} unverifiable`,
    overall: r.overall,
    foot: r.input.repo ?? `agent ${r.actor.agent}`,
  });
}

export function chainCard(rs: Receipt[]) {
  const last = rs[rs.length - 1] as Receipt;
  return ogCard({
    kicker: last.chain.outcome.toUpperCase(),
    title: `${rs.map((r) => r.overall).join(" > ")} in ${rs.length} attempt${rs.length === 1 ? "" : "s"}`,
    line: clip(last.chain.items[0]?.quote ?? "Every claim proved.", 90),
    overall: last.overall,
    foot: `proof chain ${last.chain.chainId}`,
  });
}
