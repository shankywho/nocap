"use client";
import { useEffect, useState } from "react";

export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden className="group">
      <rect x="1" y="1" width="30" height="30" rx="8" fill="var(--surface)" stroke="var(--accent)" strokeWidth="1.5" />
      <path d="M9 22 L14 17 L23 9" fill="none" stroke="var(--accent)" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
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
      className="rounded-full bg-surface px-4 py-2 font-mono text-sm ring-1 ring-hairline hover:ring-accent"
      aria-label={`Copy ${text}`}
    >
      {text} <span className="text-muted">{done ? "copied" : "copy"}</span>
    </button>
  );
}

const RECEIPT = [
  ["", "NOCAP  receipt k3f9a2  ·  agent: claude-code"],
  ["", "──────────────────────────────────────────"],
  ["text-verified", "✓ VERIFIED      \"Added exponential backoff to `withRetry`\""],
  ["text-contradicted", "✗ CONTRADICTED  \"Added tests for the retry backoff\""],
  ["text-muted", "   BITECHECK reverted src/retry.ts → 2/2 tests STILL PASS"],
  ["text-contradicted", "✗ CONTRADICTED  \"Didn't touch auth\""],
  ["text-muted", "   src/auth/session.ts  M +3 −1"],
  ["text-verified", "✓ VERIFIED      \"All 13 tests pass\"  13/13 · vitest"],
  ["", "──────────────────────────────────────────"],
  ["text-contradicted", "RESULT  FAIL · 2 verified · 2 contradicted"],
] as const;

/** Types the sample receipt line by line; shows everything at once under prefers-reduced-motion. */
export function TerminalReceipt() {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setN(RECEIPT.length);
      return;
    }
    const t = setInterval(() => setN((v) => (v >= RECEIPT.length ? v : v + 1)), 450);
    return () => clearInterval(t);
  }, []);
  return (
    <pre aria-label="Sample nocap receipt" className="min-h-72 overflow-x-auto rounded-xl bg-surface p-5 text-[12px] leading-6 ring-1 ring-hairline shadow-[0_0_80px_-20px_var(--accent)]">
      {RECEIPT.slice(0, n).map(([c, t], i) => (
        <span key={i} className={c}>{t}{"\n"}</span>
      ))}
    </pre>
  );
}

const AGENTS: Record<string, string> = {
  "Claude Code": "npx nocap init claude --write",
  Codex: "npx nocap init --all   # AGENTS.md protocol block",
  Cursor: "npx nocap init --all   # .cursor MCP entry + rules",
  OpenCode: "npx nocap init --all   # opencode MCP entry",
  "Gemini CLI": "npx nocap init --all   # GEMINI.md block + MCP entry",
  Alan: "npx nocap init --all   # installs the nocap plugin",
};

export function AgentTabs() {
  const names = Object.keys(AGENTS);
  const [active, setActive] = useState(names[0] as string);
  return (
    <div>
      <div role="tablist" className="flex flex-wrap gap-2">
        {names.map((n) => (
          <button key={n} role="tab" aria-selected={n === active} onClick={() => setActive(n)} className={`rounded-md px-3 py-1.5 font-mono text-sm ring-1 ${n === active ? "bg-accent text-black ring-accent" : "ring-hairline text-muted"}`}>{n}</button>
        ))}
      </div>
      <pre className="mt-3 overflow-x-auto rounded-lg bg-surface p-4 text-sm ring-1 ring-hairline">{AGENTS[active]}</pre>
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
      <button type="submit" disabled={!url.trim()} className="rounded-md bg-accent px-4 py-2 font-mono text-sm font-semibold text-black disabled:opacity-40">Verify</button>
    </form>
  );
}
