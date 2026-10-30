import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import type { Receipt } from "@nocap/core";

export const OG_SIZE = { width: 1200, height: 630 };
export const OG_TYPE = "image/png";

async function font(name: string) {
  const candidates = [join(process.cwd(), "src", "fonts", name), join(process.cwd(), "apps", "web", "src", "fonts", name)];
  for (const p of candidates) {
    const data = await readFile(p).catch(() => null);
    if (data) return data;
  }
  return null;
}

// The study palette: wall background, a cream document, lamp accent, Old Standard TT headline.
const WALL = "#1a110b";
const DOCUMENT = "#f1e6d0";
const INK = "#1a110b";
const INK_MUTED = "#5c4a36";
const LAMP = "#d8a45f";
const BRASS = "#a76d38";
const STATUS = { PASS: "#2f5a3a", FAIL: "#8e2a1e", MIXED: "#7a5600" } as const;

export async function ogCard(args: { kicker: string; title: string; line: string; overall: Receipt["overall"]; foot: string }) {
  const [heading, mono] = await Promise.all([font("OldStandardTT-700.woff"), font("IBMPlexMono-600.woff")]);
  const fonts = [
    ...(heading ? [{ name: "Old Standard TT", data: heading, weight: 700 as const, style: "normal" as const }] : []),
    ...(mono ? [{ name: "IBM Plex Mono", data: mono, weight: 600 as const, style: "normal" as const }] : []),
  ];
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 56, background: WALL, color: DOCUMENT, fontFamily: "IBM Plex Mono" }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 30, color: LAMP }}>
          <span>nocap</span>
          <span>{args.kicker}</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", background: DOCUMENT, color: INK, border: `2px solid ${BRASS}`, padding: 40, gap: 20 }}>
          <div style={{ fontFamily: "Old Standard TT", fontWeight: 700, fontSize: 60, lineHeight: 1.1 }}>{args.title}</div>
          <div style={{ fontSize: 26, color: INK_MUTED }}>{args.line}</div>
          <div style={{ display: "flex", alignSelf: "flex-start", border: `4px solid ${STATUS[args.overall]}`, color: STATUS[args.overall], padding: "4px 18px", fontFamily: "Old Standard TT", fontWeight: 700, fontSize: 40 }}>{args.overall}</div>
        </div>
        <div style={{ fontSize: 24, color: LAMP }}>{args.foot}</div>
      </div>
    ),
    { ...OG_SIZE, fonts },
  );
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 3)}...` : s);

export function receiptCard(r: Receipt) {
  const bad = r.claims.find((c) => c.verdict.status === "contradicted");
  return ogCard({
    kicker: `Receipt No. ${r.id}`,
    title: bad ? `Contradicted: ${clip(bad.claim.quote, 80)}` : `${r.totals.verified} claims verified`,
    line: `${r.claims.length} claims · ${r.totals.verified} verified · ${r.totals.contradicted} contradicted · ${r.totals.unverifiable} unverifiable`,
    overall: r.overall,
    foot: r.input.repo ?? `agent ${r.actor.agent}`,
  });
}

export function chainCard(rs: Receipt[]) {
  const last = rs[rs.length - 1] as Receipt;
  return ogCard({
    kicker: `Proof chain ${last.chain.chainId}`,
    title: `${rs.map((r) => r.overall).join(" to ")} in ${rs.length} attempt${rs.length === 1 ? "" : "s"}`,
    line: clip(last.chain.items[0]?.quote ?? "Every claim proved.", 90),
    overall: last.overall,
    foot: `outcome: ${last.chain.outcome}`,
  });
}
