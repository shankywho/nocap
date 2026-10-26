"use client";
import { useCallback, useEffect, useRef, useState } from "react";

export function Logo({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <rect x="1.5" y="1.5" width="29" height="29" rx="7" fill="var(--accent)" />
      <path d="M9 17.5 L14 22 L23.5 10" fill="none" stroke="var(--on-accent)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function CopyPill({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      onClick={() => {
        void navigator.clipboard?.writeText(text).then(() => {
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        });
      }}
      className="rounded-md bg-surface px-3.5 py-2 font-mono text-[13px] ring-1 ring-hairline hover:ring-foreground"
      aria-label={`Copy ${text}`}
    >
      <span className="text-muted">$</span> {text} <span className="ml-2 text-muted">{done ? "copied" : "copy"}</span>
    </button>
  );
}

/* ── The galley: the agent's real summary, marked up claim by claim ─────────── */

export interface GalleyClaim {
  id: string;
  pre: string;
  quote: string;
  status: "verified" | "contradicted" | "unverifiable";
  note: string;
}
export interface GalleyData {
  receiptId: string;
  overall: "PASS" | "FAIL" | "MIXED";
  totals: { verified: number; contradicted: number; unverifiable: number };
  claims: GalleyClaim[];
}

const GLYPH = { verified: "✓", contradicted: "✗", unverifiable: "!" } as const;
const WORD = { verified: "verified", contradicted: "contradicted", unverifiable: "unverifiable" } as const;
const TONE = { verified: "text-verified", contradicted: "text-contradicted", unverifiable: "text-unverifiable" } as const;

export function Galley({ data, auto = true }: { data: GalleyData; auto?: boolean }) {
  const n = data.claims.length;
  const [step, setStep] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const play = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setStep(n + 1);
      return;
    }
    setStep(0);
    let i = 0;
    const tick = () => {
      i += 1;
      setStep(i);
      if (i <= n) timer.current = setTimeout(tick, i === n ? 700 : 950);
    };
    timer.current = setTimeout(tick, 900);
  }, [n]);

  useEffect(() => {
    if (auto) play();
    else setStep(n + 1);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [auto, play, n]);

  const done = step > n;
  return (
    <figure className="crop rounded-sm bg-sheet p-5 shadow-[var(--shadow)] ring-1 ring-hairline sm:p-7" aria-label="Agent summary marked up claim by claim">
      <figcaption className="mb-5 flex items-center justify-between font-mono text-[11px] uppercase tracking-[0.14em] text-muted">
        <span>receipt {data.receiptId} · attempt 1</span>
        <button onClick={play} className="uppercase underline-offset-4 hover:underline" aria-label="Replay the markup">replay ↻</button>
      </figcaption>
      <p className="mb-3 font-mono text-[11px] uppercase tracking-[0.14em] text-muted">agent says</p>
      <ol className="space-y-5">
        {data.claims.map((c, i) => {
          const marked = step > i;
          const bad = marked && c.status === "contradicted";
          const unsure = marked && c.status === "unverifiable";
          return (
            <li key={c.id} className="grid grid-cols-[1.75rem_1fr] gap-x-3 gap-y-1 sm:grid-cols-[1.75rem_1.25fr_1fr] sm:gap-x-5">
              <span aria-hidden className={`pt-1 text-center font-mono text-lg leading-6 ${marked ? TONE[c.status] : "text-muted"}`}>
                {marked ? <span className="pop inline-block">{GLYPH[c.status]}</span> : "·"}
              </span>
              <p className="font-serif text-[1.2rem] leading-[1.45] sm:text-[1.3rem]">
                {c.pre && <span className="text-muted">{c.pre} </span>}
                <span className={c.status === "contradicted" ? "strike" : c.status === "unverifiable" ? "hl" : ""} data-on={bad || unsure ? "true" : "false"}>
                  {c.quote}
                </span>
                <span className="sr-only"> {marked ? WORD[c.status] : "not checked yet"}</span>
              </p>
              <p className={`col-start-2 font-mono text-[12px] leading-5 transition-opacity duration-500 sm:col-start-3 sm:pt-1.5 ${marked ? "opacity-100" : "opacity-0"} ${c.status === "contradicted" ? "text-contradicted" : "text-muted"}`}>
                {c.note}
              </p>
            </li>
          );
        })}
      </ol>
      <div className="mt-7 flex min-h-[4.5rem] items-center justify-between border-t border-dashed border-hairline pt-4">
        <p className="font-mono text-[12px] text-muted">
          {done ? `${data.totals.verified} verified · ${data.totals.contradicted} contradicted · ${data.totals.unverifiable} unverifiable` : "checking…"}
        </p>
        {done && (
          <span className={`stamp rounded-sm border-[3px] px-3 py-1 font-sans text-2xl font-extrabold uppercase tracking-wider ${data.overall === "PASS" ? "border-verified text-verified" : data.overall === "FAIL" ? "border-contradicted text-contradicted" : "border-unverifiable text-unverifiable"}`}>
            {data.overall}
          </span>
        )}
      </div>
    </figure>
  );
}

/* ── Bitecheck: revert the change and watch the tests ───────────────────────── */

export interface RevertCase {
  label: string;
  tests: string[];
  /** Whether the tests still pass after the revert. */
  stillPass: boolean;
}

const DIFF = [
  { t: "del", s: "const delayMs = 100;" },
  { t: "add", s: "const delayMs = 100 * 2 ** (attempt - 1);" },
] as const;

export function RevertDemo({ cases }: { cases: RevertCase[] }) {
  const [which, setWhich] = useState(0);
  const [reverted, setReverted] = useState(false);
  const c = cases[which] as RevertCase;
  const verdict = c.stillPass ? "toothless" : "bites";
  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-2 [&>*]:min-w-0">
      <div className="crop rounded-sm bg-sheet p-5 shadow-[var(--shadow)] ring-1 ring-hairline">
        <p className="mb-3 font-mono text-[11px] uppercase tracking-[0.14em] text-muted">src/retry.ts · {reverted ? "reverted to base" : "agent's change"}</p>
        <pre className="overflow-x-auto text-[13px] leading-6">
          {reverted ? (
            <>
              <span className="block text-muted">{"  const delayMs = 100;"}</span>
              <span className="block text-muted line-through opacity-50">{"+ const delayMs = 100 * 2 ** (attempt - 1);"}</span>
            </>
          ) : (
            DIFF.map((l, i) => (
              <span key={i} className={`block ${l.t === "add" ? "text-verified" : "text-contradicted"}`}>{`${l.t === "add" ? "+" : "-"} ${l.s}`}</span>
            ))
          )}
        </pre>
        <button
          onClick={() => setReverted((v) => !v)}
          className="mt-5 rounded-md bg-accent px-4 py-2 font-mono text-sm font-semibold text-on-accent"
          aria-pressed={reverted}
        >
          {reverted ? "Restore the change" : "Revert src/retry.ts"}
        </button>
      </div>
      <div className="crop rounded-sm bg-sheet p-5 shadow-[var(--shadow)] ring-1 ring-hairline">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {cases.map((k, i) => (
            <button key={k.label} onClick={() => setWhich(i)} aria-pressed={i === which} className={`rounded px-2.5 py-1 font-mono text-[12px] ring-1 ${i === which ? "bg-foreground text-background ring-foreground" : "text-muted ring-hairline"}`}>
              {k.label}
            </button>
          ))}
        </div>
        <ul className="space-y-2 font-mono text-[13px]">
          {c.tests.map((t) => {
            const pass = !reverted || c.stillPass;
            return (
              <li key={t} className="flex gap-3">
                <span className={`w-4 ${pass ? "text-verified" : "text-contradicted"}`} aria-hidden>{pass ? "✓" : "✗"}</span>
                <span>{t}</span>
                <span className="sr-only">{pass ? "passes" : "fails"}</span>
              </li>
            );
          })}
        </ul>
        <p className="mt-5 min-h-12 border-t border-dashed border-hairline pt-4 font-sans text-sm">
          {!reverted ? (
            <span className="text-muted">Both pass on the agent&apos;s code. Revert the change to see whether they notice.</span>
          ) : c.stillPass ? (
            <span className="text-contradicted"><b>{verdict}.</b> They pass without the change, so they never tested it. nocap marks the claim ✗.</span>
          ) : (
            <span className="text-verified"><b>{verdict}.</b> They fail without the change, so they depend on it. nocap marks the claim ✓.</span>
          )}
        </p>
      </div>
    </div>
  );
}

const AGENTS: Record<string, { cmd: string; note: string }> = {
  "Claude Code": { cmd: "npx @shankywho/nocap init claude --write", note: "Stop hook in .claude/settings.json. Report-only unless NOCAP_BLOCK=1." },
  Codex: { cmd: "npx @shankywho/nocap init --all --write --user", note: "MCP entry in config.toml and an AGENTS.md protocol block." },
  Cursor: { cmd: "npx @shankywho/nocap init --all --write", note: "MCP entry in .cursor/mcp.json." },
  OpenCode: { cmd: "npx @shankywho/nocap init --all --write", note: "MCP entry in opencode.json." },
  "Gemini CLI": { cmd: "npx @shankywho/nocap init --all --write", note: "MCP entry in .gemini/settings.json." },
  Alan: { cmd: "npx @shankywho/nocap init --all --write", note: "Add plugins/nocap to your workspace; the skill calls verify_claims before done." },
};

export function AgentTabs() {
  const names = Object.keys(AGENTS);
  const [active, setActive] = useState(names[0] as string);
  const a = AGENTS[active] as { cmd: string; note: string };
  return (
    <div>
      <div role="tablist" aria-label="Agent" className="flex flex-wrap gap-2">
        {names.map((n) => (
          <button key={n} role="tab" aria-selected={n === active} onClick={() => setActive(n)} className={`rounded-md px-3 py-1.5 font-mono text-sm ring-1 ${n === active ? "bg-foreground text-background ring-foreground" : "text-muted ring-hairline hover:ring-foreground"}`}>{n}</button>
        ))}
      </div>
      <pre className="mt-3 overflow-x-auto rounded-md bg-surface p-4 text-sm ring-1 ring-hairline">{a.cmd}</pre>
      <p className="mt-2 text-sm text-muted">{a.note}</p>
    </div>
  );
}

export function PrForm() {
  const [url, setUrl] = useState("");
  const [summary, setSummary] = useState("");
  return (
    <form action="/verify" method="get" className="space-y-3" onSubmit={(e) => { if (!url.trim()) e.preventDefault(); }}>
      <label className="block text-sm text-muted" htmlFor="pr">Public GitHub PR URL</label>
      <input id="pr" name="pr" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://github.com/owner/repo/pull/123" className="w-full rounded-md bg-surface px-3 py-2 font-mono text-sm ring-1 ring-hairline" />
      <label className="block text-sm text-muted" htmlFor="summary">Agent summary (optional, defaults to the PR description)</label>
      <textarea id="summary" name="summary" value={summary} onChange={(e) => setSummary(e.target.value)} rows={3} className="w-full rounded-md bg-surface px-3 py-2 font-mono text-sm ring-1 ring-hairline" />
      <button type="submit" disabled={!url.trim()} className="rounded-md bg-accent px-4 py-2 font-mono text-sm font-semibold text-on-accent disabled:opacity-40">Verify the PR</button>
    </form>
  );
}
