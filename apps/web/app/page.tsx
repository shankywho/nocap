import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Receipt } from "@nocap/core";
import { getStore } from "../src/server/store";
import { AgentTabs, CopyPill, Galley, Logo, PrForm, RevertDemo, type GalleyData } from "../src/ui/landing";
import { StreamRun } from "../src/ui/StreamRun";

export const dynamic = "force-dynamic";

const REPO = "https://github.com/shankar7055/NoCap";

function evalTable(): string {
  for (const base of [process.cwd(), resolve(process.cwd(), "../..")]) {
    try {
      return /```\n([\s\S]*?)```/.exec(readFileSync(resolve(base, "eval/results.md"), "utf8"))?.[1]?.trim() ?? "";
    } catch {
      /* try the next base */
    }
  }
  return "";
}

/** Reads the B1 and B3 rows of the eval table, so the page quotes the numbers the eval printed. */
function evalNumbers(table: string) {
  const row = (re: RegExp) => re.exec(table);
  const b1 = row(/B1[^\n]*?(\d+)\/5\s+(\d+)/);
  const b3 = row(/B3[^\n]*?(\d+)\/5\s+(\d+)/);
  return b1 && b3 ? { ci: `${b1[1]}/5`, nocap: `${b3[1]}/5`, falseAcc: b3[2] as string } : null;
}

function galleyOf(r: Receipt): GalleyData {
  const claims = [...r.claims].sort((a, b) => (a.claim.span?.[0] ?? 0) - (b.claim.span?.[0] ?? 0));
  let at = 0;
  return {
    receiptId: r.id,
    overall: r.overall,
    totals: r.totals,
    claims: claims.map(({ claim, verdict }) => {
      const [from, to] = claim.span ?? [at, at + claim.quote.length];
      const pre = r.input.summary.slice(at, from).trim();
      at = to;
      const bc = verdict.bitecheck;
      const note =
        verdict.status === "contradicted" && bc?.reverted?.kind === "testRun"
          ? `BITECHECK reverted ${bc.revertedFiles.join(", ")} → ${bc.reverted.passed}/${bc.reverted.total} selected tests still pass. They don't exercise the change.`
          : verdict.reason.length > 90
            ? `${verdict.reason.slice(0, 87)}…`
            : verdict.reason;
      return { id: claim.id, pre, quote: r.input.summary.slice(from, to).trim(), status: verdict.status, note };
    }),
  };
}

const Eyebrow = ({ children }: { children: React.ReactNode }) => (
  <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted">{children}</p>
);
const H2 = ({ children }: { children: React.ReactNode }) => (
  <h2 className="max-w-3xl text-[2rem] font-semibold leading-[1.05] tracking-[-0.03em] sm:text-[2.75rem]">{children}</h2>
);
const Section = ({ id, children }: { id?: string; children: React.ReactNode }) => (
  <section id={id} className="mx-auto max-w-6xl scroll-mt-24 space-y-8 px-5 py-20 sm:px-8">{children}</section>
);

const LIES = [
  { id: "ex-toothless", title: "Tests that don't test" },
  { id: "ex-scope", title: "“I didn't touch auth”" },
  { id: "ex-count", title: "“All tests pass”" },
] as const;

export default async function Home() {
  const store = getStore();
  const [hero, scope, count] = await Promise.all(LIES.map((l) => store.get(l.id)));
  const table = evalTable();
  const nums = evalNumbers(table);
  const lies = [hero, scope, count].map((row, i) => {
    const r = row?.receipt;
    const bad = r?.claims.find((c) => c.verdict.status === "contradicted");
    return { ...LIES[i]!, quote: bad?.claim.quote ?? null, reason: bad?.verdict.reason ?? null, exists: Boolean(row) };
  });

  return (
    <main>
      <header className="sticky top-3 z-20 mx-auto max-w-6xl px-3 sm:px-5">
        <nav className="flex items-center justify-between rounded-xl bg-surface/85 px-3 py-2 shadow-[var(--shadow)] ring-1 ring-hairline backdrop-blur" aria-label="Main">
          <a href="/" className="flex items-center gap-2 text-lg font-semibold tracking-tight"><Logo /> nocap</a>
          <div className="hidden items-center gap-6 text-sm text-muted md:flex">
            <a href="#bitecheck" className="hover:text-foreground">Bitecheck</a>
            <a href="#loop" className="hover:text-foreground">The loop</a>
            <a href="#agents" className="hover:text-foreground">Agents</a>
            <a href="/docs" className="hover:text-foreground">Docs</a>
            <a href={REPO} className="hover:text-foreground">GitHub</a>
          </div>
          <a href="#loop" className="rounded-lg bg-accent px-3.5 py-1.5 text-sm font-semibold text-on-accent">Try the demo</a>
        </nav>
      </header>

      <div className="relative overflow-hidden">
        <div className="gridbg pointer-events-none absolute inset-0" aria-hidden />
        <Section>
          <div className="relative grid items-start gap-12 lg:grid-cols-[0.9fr_1.1fr]">
            <div className="space-y-7 pt-4 lg:pt-10">
              <Eyebrow>Open source · MIT · runs on your machine</Eyebrow>
              <h1 className="text-[2.75rem] font-semibold leading-[0.98] tracking-[-0.04em] sm:text-[4.25rem]">
                Your agent says the tests cover it. We revert the fix and check.
              </h1>
              <p className="max-w-lg text-[1.05rem] leading-relaxed text-muted">
                nocap checks every claim in a coding agent&apos;s summary against the diff and real test runs, then sends each false claim back until the agent proves it.
              </p>
              <div className="flex flex-wrap items-center gap-3">
                <a href="#loop" className="rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-on-accent">Watch a repair loop</a>
                <CopyPill text="npx @shankywho/nocap demo" />
              </div>
              <p className="font-mono text-[12px] text-muted">Claude Code · Codex · Cursor · OpenCode · Gemini CLI · Alan</p>
            </div>
            <div>
              {hero ? <Galley data={galleyOf(hero.receipt)} /> : <p className="text-muted">Example receipt unavailable.</p>}
              <p className="mt-6 font-mono text-[11px] leading-5 text-muted">
                This is a real receipt (<a className="underline underline-offset-4" href="/r/ex-toothless">ex-toothless</a>), produced by running nocap on a fixture repo. ✓ verified · <span className="text-contradicted">✗ contradicted</span> · ! unverifiable
              </p>
            </div>
          </div>
        </Section>
      </div>

      {nums && (
        <div className="border-y border-hairline bg-surface/60">
          <dl className="mx-auto grid max-w-6xl grid-cols-1 divide-y divide-hairline px-5 sm:grid-cols-3 sm:divide-x sm:divide-y-0 sm:px-8">
            {[
              [nums.ci, "planted lies caught by CI alone", "text-contradicted"],
              [nums.nocap, "caught by nocap", "text-verified"],
              [nums.falseAcc, "false accusations on honest work", "text-foreground"],
            ].map(([n, l, c]) => (
              <div key={l} className="py-7 sm:px-8 sm:first:pl-0">
                <dt className="order-2 mt-1 text-sm text-muted">{l}</dt>
                <dd className={`text-5xl font-semibold tracking-[-0.04em] ${c}`}>{n}</dd>
              </div>
            ))}
          </dl>
          <p className="mx-auto max-w-6xl px-5 pb-5 font-mono text-[11px] text-muted sm:px-8">From <code>pnpm eval</code>: five planted lies and three honest scenarios, run under four strategies.</p>
        </div>
      )}

      <Section>
        <Eyebrow>Three claims a green CI run waves through</Eyebrow>
        <H2>The summary reads fine. The diff says otherwise.</H2>
        <div className="grid gap-5 md:grid-cols-3">
          {lies.map((l) => (
            <a key={l.id} href={l.exists ? `/r/${l.id}` : "#"} className="group flex flex-col gap-4 rounded-sm bg-sheet p-5 shadow-[var(--shadow)] ring-1 ring-hairline transition hover:-translate-y-0.5 hover:ring-foreground">
              <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted">{l.title}</p>
              <p className="font-serif text-[1.25rem] leading-snug"><span className="strike" data-on="true">{l.quote ?? "—"}</span></p>
              <p className="text-sm leading-relaxed text-muted">{l.reason}</p>
              <p className="mt-auto font-mono text-xs text-contradicted group-hover:underline">✗ open the receipt →</p>
            </a>
          ))}
        </div>
      </Section>

      <Section id="bitecheck">
        <Eyebrow>Bitecheck</Eyebrow>
        <H2>If the tests still pass without the fix, they never tested it.</H2>
        <p className="max-w-2xl text-muted">nocap reverts the agent&apos;s source change in a throwaway git worktree and re-runs only the tests the agent added. Try it on the two example runs.</p>
        <RevertDemo
          cases={[
            { label: "toothless tests", tests: ["eventually succeeds after two failures", "retries only the configured number of times"], stillPass: true },
            { label: "tests that bite", tests: ["backs off exponentially between attempts", "doubles the delay on each retry"], stillPass: false },
          ]}
        />
      </Section>

      <Section id="loop">
        <Eyebrow>The repair loop</Eyebrow>
        <H2>A ✗ goes back to the agent. The next attempt has to earn the ✓.</H2>
        <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
          <div className="space-y-6">
            <StreamRun endpoint="/api/demo/loop" label="Play the repair loop" />
            <div>
              <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.14em] text-muted">Or verify a pull request</p>
              <StreamRun endpoint="/api/demo" label="Verify demo/fixture-shop#7" />
            </div>
          </div>
          <a href="/r/ex-gamed" className="flex flex-col gap-3 self-start rounded-sm bg-sheet p-5 shadow-[var(--shadow)] ring-1 ring-hairline hover:ring-foreground">
            <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted">Anti-gaming</p>
            <p className="font-serif text-[1.35rem] leading-snug">Deleting the failing test doesn&apos;t clear the claim.</p>
            <p className="text-sm text-muted">An agent that removes the test and drops the sentence without retracting it is flagged <code>repair_by_weakening</code> and the chain stays unresolved.</p>
            <p className="font-mono text-xs text-contradicted">✗ see the gamed attempt →</p>
          </a>
        </div>
      </Section>

      <Section>
        <Eyebrow>Several agents, one task</Eyebrow>
        <H2>Nobody builds on a teammate&apos;s word. Only on proven facts.</H2>
        <div className="grid gap-4 md:grid-cols-[1fr_auto_1fr_auto_1fr] md:items-stretch">
          <div className="rounded-sm bg-sheet p-5 ring-1 ring-hairline"><p className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted">backend agent</p><p className="mt-2 font-serif text-lg"><span className="strike" data-on="true">Added computeDelay() in src/backoff.ts</span></p><p className="mt-2 font-mono text-xs text-contradicted">✗ it exported getDelay()</p></div>
          <span aria-hidden className="self-center text-center font-mono text-muted">→</span>
          <div className="rounded-sm bg-foreground p-5 text-background"><p className="font-mono text-[11px] uppercase tracking-[0.14em] opacity-70">.nocap/ledger.jsonl</p><p className="mt-2 text-lg font-semibold">Facts with the commit and file hashes they were true for.</p><p className="mt-2 font-mono text-xs opacity-70">stale when the files change</p></div>
          <span aria-hidden className="self-center text-center font-mono text-muted">→</span>
          <div className="rounded-sm bg-sheet p-5 ring-1 ring-hairline"><p className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted">frontend agent</p><p className="mt-2 font-mono text-sm">ledger_facts(&quot;computeDelay&quot;)</p><p className="mt-2 font-mono text-xs text-contradicted">CONTRADICTED by backend</p></div>
        </div>
      </Section>

      <Section id="agents">
        <Eyebrow>Install</Eyebrow>
        <H2>One command wires every agent it finds.</H2>
        <AgentTabs />
        <p className="font-mono text-sm"><a className="underline underline-offset-4" href="/agents">Per-agent accuracy →</a> <span className="text-muted">self-reported runs, not a model benchmark</span></p>
      </Section>

      {table && (
        <Section>
          <Eyebrow>Eval output</Eyebrow>
          <H2>Verbatim from <code className="font-mono text-[0.8em]">pnpm eval</code>.</H2>
          <pre className="overflow-x-auto rounded-sm bg-sheet p-5 text-[13px] leading-6 shadow-[var(--shadow)] ring-1 ring-hairline">{table}</pre>
        </Section>
      )}

      <Section>
        <Eyebrow>Pull requests</Eyebrow>
        <H2>Check a public PR without installing anything.</H2>
        <p className="max-w-xl text-sm text-muted">PR mode is static: CI status stands in for the test run, and anything that needs execution is marked ! rather than guessed.</p>
        <div className="max-w-2xl"><PrForm /></div>
      </Section>

      <Section>
        <H2>Questions</H2>
        <dl className="grid gap-x-10 gap-y-7 md:grid-cols-2">
          {[
            ["Does my code leave my machine?", "No. Only the summary and file paths go to the model, and with --offline nothing does. Tests and Bitecheck run locally."],
            ["Why not just use CI?", "CI says the suite is green. It can't say the new tests exercise the change or that the summary is true."],
            ["Which agents?", "Any that ends with a summary. Hooks and an MCP server cover Claude Code, Codex, Cursor, OpenCode, Gemini CLI and Alan."],
            ["Who decides a verdict?", "Code. The model only splits the summary into claims and maps concepts to paths. A claim without hard evidence is ! , never ✗."],
            ["What can't it check?", "Intent and design quality. Bitecheck reverts whole files, not hunks, and PR mode can't run tests."],
          ].map(([q, a]) => (
            <div key={q}><dt className="font-semibold">{q}</dt><dd className="mt-1 text-sm leading-relaxed text-muted">{a}</dd></div>
          ))}
        </dl>
      </Section>

      <footer className="border-t border-hairline">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-5 py-8 font-mono text-sm text-muted sm:px-8">
          <span className="flex items-center gap-2 text-foreground"><Logo size={20} /> nocap · MIT</span>
          <span className="flex gap-5"><a href={REPO}>GitHub</a><a href="/docs">Docs</a><a href="/agents">Agents</a><a href="https://www.npmjs.com/package/@shankywho/nocap">npm</a></span>
        </div>
      </footer>
    </main>
  );
}
