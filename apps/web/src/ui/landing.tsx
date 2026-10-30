"use client";
import { useCallback, useEffect, useRef, useState } from "react";

/* Logo: a square outline with one diagonal slash that turns into a check on hover. Colour follows the text colour. */
export function Mark({ size = 20 }: { size?: number }) {
  return (
    <svg className="mark" width={size} height={size} viewBox="0 0 20 20" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="square">
      <rect x="1.5" y="1.5" width="17" height="17" />
      <path className="slash" d="M5.5 14.5 L14.5 5.5" />
      <path className="check" d="M5 10.5 L8.5 14 L15 6.5" />
    </svg>
  );
}

export function Logo({ size = 20 }: { size?: number }) {
  return (
    <span className="inline-flex items-center gap-2 font-mono text-[18px] font-semibold lowercase leading-none">
      <Mark size={size} />
      nocap
    </span>
  );
}

/* Navigation: transparent with cream text over the hero, then a wall-coloured bar with a brass rule. */
export function Nav({ heroHeight = 0.88 }: { heroHeight?: number }) {
  const [solid, setSolid] = useState(false);
  useEffect(() => {
    const on = () => setSolid(window.scrollY > window.innerHeight * heroHeight - 72);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, [heroHeight]);
  return (
    <header className={`fixed inset-x-0 top-0 z-30 border-b ${solid ? "border-brass bg-wall" : "border-transparent bg-transparent"}`}>
      <nav className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3 sm:px-8" aria-label="Main">
        <a href="/" className="text-cream" aria-label="nocap home">
          <Logo />
        </a>
        <div className="hidden items-center gap-6 text-[15px] text-cream md:flex">
          <a href="#no-1" className="hover:text-lamp">How it checks</a>
          <a href="#no-2" className="hover:text-lamp">Bitecheck</a>
          <a href="#no-3" className="hover:text-lamp">Repair loop</a>
          <a href="#no-5" className="hover:text-lamp">Install</a>
          <a href="/docs" className="hover:text-lamp">Docs</a>
          <a href="https://github.com/shankywho/nocap" className="hover:text-lamp">GitHub</a>
        </div>
        <a href="#no-3" className="btn">Try the demo</a>
      </nav>
    </header>
  );
}

/* The install line: a small document with a copy button. */
export function CopyPill({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <span className="inline-flex max-w-full items-center gap-3 border border-brass bg-document px-3 py-2 font-mono text-[14px] text-ink" style={{ borderRadius: 2 }}>
      <span className="overflow-x-auto whitespace-nowrap">
        <span className="text-ink-muted">$</span> {text}
      </span>
      <button
        onClick={() => {
          void navigator.clipboard?.writeText(text).then(() => {
            setDone(true);
            setTimeout(() => setDone(false), 1500);
          });
        }}
        className="shrink-0 border-l border-brass pl-3 text-[13px] underline underline-offset-4"
        aria-label={`Copy ${text}`}
      >
        {done ? "copied" : "copy"}
      </button>
    </span>
  );
}

/* The galley: the agent's real summary, marked up claim by claim on a cream document. */

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
    <figure className="m-0">
      <div className="doc" aria-label="The agent's summary, checked claim by claim">
        <p className="mb-4 font-mono text-[12px] text-ink-muted">The agent said:</p>
        <ol className="m-0 list-none space-y-5 p-0">
          {data.claims.map((c, i) => {
            const marked = step > i;
            const bad = marked && c.status === "contradicted";
            const unsure = marked && c.status === "unverifiable";
            return (
              <li key={c.id} className="grid grid-cols-[1.5rem_1fr] gap-x-3 gap-y-1 sm:grid-cols-[1.5rem_1.2fr_1fr] sm:gap-x-5">
                <span aria-hidden className={`pt-0.5 text-center font-mono text-lg leading-6 ${marked ? TONE[c.status] : "text-ink-muted"}`}>
                  {marked ? <span className="pop inline-block">{GLYPH[c.status]}</span> : "·"}
                </span>
                <p className="m-0 font-mono text-[15px] leading-[1.55]">
                  {c.pre && <span className="text-ink-muted">{c.pre} </span>}
                  <span className={c.status === "contradicted" ? "strike" : c.status === "unverifiable" ? "hl" : ""} data-on={bad || unsure ? "true" : "false"}>
                    {c.quote}
                  </span>
                </p>
                <p className={`col-start-2 m-0 font-mono text-[12px] leading-5 sm:col-start-3 ${marked ? "" : "invisible"} ${c.status === "contradicted" ? "text-contradicted" : "text-ink-muted"}`}>
                  <b className={TONE[c.status]}>{marked ? `${GLYPH[c.status]} ${WORD[c.status]}` : "not checked yet"}</b>
                  <br />
                  {c.note}
                </p>
              </li>
            );
          })}
        </ol>
        <div className="mt-6 flex min-h-[4.5rem] items-center justify-between gap-3 border-t border-brass pt-4" style={{ borderTopStyle: "double", borderTopWidth: 3 }}>
          <p className="m-0 font-mono text-[12px] text-ink-muted">
            {done ? `${data.totals.verified} verified, ${data.totals.contradicted} contradicted, ${data.totals.unverifiable} unverifiable` : "checking"}
          </p>
          {done && (
            <span className={`stamp border-[3px] px-3 py-1 font-heading text-2xl font-bold uppercase tracking-wider ${data.overall === "PASS" ? "border-verified text-verified" : data.overall === "FAIL" ? "border-contradicted text-contradicted" : "border-unverifiable text-unverifiable"}`}>
              {data.overall}
            </span>
          )}
        </div>
      </div>
      <figcaption className="plate flex items-center justify-between gap-3">
        <span>Receipt No. {data.receiptId} · attempt 1 · real output</span>
        <button onClick={play} className="linklamp" aria-label="Replay the markup">replay</button>
      </figcaption>
    </figure>
  );
}

/* Bitecheck: revert the change (or stub the new function) and watch the tests. */

export interface BiteCase {
  label: string;
  /** Which kind of change the agent made. */
  kind: "revert" | "stub";
  file: string;
  /** Lines shown with the change applied. */
  changed: { sign: "+" | "-" | " "; text: string }[];
  /** Lines shown after the revert, or after the body is stubbed. */
  after: { sign: "+" | "-" | " "; text: string }[];
  tests: string[];
  /** Whether the tests still pass after the revert or stub. */
  stillPass: boolean;
}

export function RevertDemo({ cases }: { cases: BiteCase[] }) {
  const [which, setWhich] = useState(0);
  const [applied, setApplied] = useState(false);
  const c = cases[which] as BiteCase;
  const verb = c.kind === "stub" ? "Stub the body" : "Revert the change";
  const label = c.kind === "stub" ? "toothless (stub)" : "toothless";
  const bites = c.kind === "stub" ? "bites (stub)" : "bites";
  const lines = applied ? c.after : c.changed;
  const pick = (i: number) => {
    setWhich(i);
    setApplied(false);
  };
  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="Example">
        {cases.map((k, i) => (
          <button key={k.label} onClick={() => pick(i)} aria-pressed={i === which} className={`border border-brass px-3 py-1.5 font-mono text-[13px] ${i === which ? "bg-lamp text-ink" : "bg-transparent text-cream"}`} style={{ borderRadius: 2 }}>
            {k.label}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2 [&>*]:min-w-0">
        <div>
          <div className="doc">
            <p className="mb-3 font-mono text-[12px] text-ink-muted">{c.file} · {applied ? (c.kind === "stub" ? "body stubbed" : "reverted to base") : "the agent's change"}</p>
            <pre className="m-0 overflow-x-auto font-mono text-[13px] leading-6">
              {lines.map((l, i) => (
                <span key={i} className={`block ${l.sign === "+" ? "text-verified" : l.sign === "-" ? "text-contradicted" : "text-ink-muted"}`}>{`${l.sign} ${l.text}`}</span>
              ))}
            </pre>
            <button onClick={() => setApplied((v) => !v)} aria-pressed={applied} className="btn mt-5 font-mono text-[14px]">
              {applied ? "Restore the change" : verb}
            </button>
          </div>
          <p className="plate">Source change · {c.kind === "stub" ? "new function, nothing to revert" : "existing function modified"}</p>
        </div>
        <div>
          <div className="doc">
            <ul className="m-0 list-none space-y-2 p-0 font-mono text-[13px]">
              {c.tests.map((t) => {
                const pass = !applied || c.stillPass;
                return (
                  <li key={t} className="flex gap-3">
                    <span className={`w-24 shrink-0 ${pass ? "text-verified" : "text-contradicted"}`}>{pass ? "✓ passes" : "✗ fails"}</span>
                    <span>{t}</span>
                  </li>
                );
              })}
            </ul>
            <p className="mb-0 mt-5 min-h-12 border-t border-brass pt-4 text-[15px]">
              {!applied ? (
                <span className="text-ink-muted">Both tests pass on the agent&apos;s code. Press the button to see whether they notice.</span>
              ) : c.stillPass ? (
                <span className="text-contradicted"><b>✗ {label}.</b> The tests pass without the change, so they never tested it. nocap marks the claim contradicted.</span>
              ) : (
                <span className="text-verified"><b>✓ {bites}.</b> The tests fail without the change, so they depend on it. nocap marks the claim verified.</span>
              )}
            </p>
          </div>
          <p className="plate">Test run · {c.tests.length} tests the agent added</p>
        </div>
      </div>
    </div>
  );
}

const AGENTS: Record<string, { cmd: string; note: string }> = {
  "Claude Code": { cmd: "npx @shankywho/nocap init claude --write", note: "Adds a Stop hook to .claude/settings.json. It reports by default and blocks only with NOCAP_BLOCK=1." },
  Codex: { cmd: "npx @shankywho/nocap init --all --write --user", note: "Adds an MCP entry to config.toml and a protocol block to AGENTS.md. Codex's notify hook can report but cannot block." },
  Cursor: { cmd: "npx @shankywho/nocap init --all --write", note: "Adds an MCP entry to .cursor/mcp.json." },
  OpenCode: { cmd: "npx @shankywho/nocap init --all --write", note: "Adds an MCP entry to opencode.json." },
  "Gemini CLI": { cmd: "npx @shankywho/nocap init --all --write", note: "Adds an MCP entry to .gemini/settings.json. The AfterAgent hook can deny with NOCAP_BLOCK=1." },
  Alan: { cmd: "npx @shankywho/nocap init --all --write", note: "Add plugins/nocap to your workspace. The skill calls verify_claims before the agent says it is done." },
};

export function AgentTabs() {
  const names = Object.keys(AGENTS);
  const [active, setActive] = useState(names[0] as string);
  const a = AGENTS[active] as { cmd: string; note: string };
  return (
    <div>
      <div role="tablist" aria-label="Agent" className="mb-4 flex flex-wrap gap-2">
        {names.map((n) => (
          <button key={n} role="tab" aria-selected={n === active} onClick={() => setActive(n)} className={`border border-brass px-3 py-1.5 font-mono text-[13px] ${n === active ? "bg-lamp text-ink" : "bg-transparent text-cream"}`} style={{ borderRadius: 2 }}>
            {n}
          </button>
        ))}
      </div>
      <div className="doc">
        <pre className="m-0 overflow-x-auto font-mono text-[14px]">{a.cmd}</pre>
        <p className="mb-0 mt-3 text-[15px] text-ink-muted">{a.note}</p>
      </div>
      <p className="plate">{active} · dry run by default; add --write to apply</p>
    </div>
  );
}

export function PrForm() {
  const [url, setUrl] = useState("");
  const [summary, setSummary] = useState("");
  const field = "w-full border border-brass bg-document px-3 py-2 font-mono text-[14px] text-ink";
  return (
    <form action="/verify" method="get" className="doc space-y-3" onSubmit={(e) => { if (!url.trim()) e.preventDefault(); }}>
      <label className="block text-[15px] text-ink-muted" htmlFor="pr">Public GitHub pull request URL</label>
      <input id="pr" name="pr" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://github.com/owner/repo/pull/123" className={field} style={{ borderRadius: 2 }} />
      <label className="block text-[15px] text-ink-muted" htmlFor="summary">Agent summary (optional, defaults to the PR description)</label>
      <textarea id="summary" name="summary" value={summary} onChange={(e) => setSummary(e.target.value)} rows={3} className={field} style={{ borderRadius: 2 }} />
      <button type="submit" disabled={!url.trim()} className="btn disabled:opacity-40">Check the pull request</button>
    </form>
  );
}
