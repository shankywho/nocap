import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { getStore } from "../src/server/store";
import { AgentTabs, CopyPill, Logo, PrForm, TerminalReceipt } from "../src/ui/landing";
import { StreamRun } from "../src/ui/StreamRun";

export const dynamic = "force-dynamic";

function evalTable(): string {
  for (const base of [process.cwd(), resolve(process.cwd(), "../..")]) {
    try {
      const text = readFileSync(resolve(base, "eval/results.md"), "utf8");
      return /```\n([\s\S]*?)```/.exec(text)?.[1]?.trim() ?? "";
    } catch {
      /* try the next base */
    }
  }
  return "";
}

const H2 = ({ children }: { children: React.ReactNode }) => <h2 className="text-3xl font-semibold tracking-tight">{children}</h2>;
const Section = ({ id, children }: { id?: string; children: React.ReactNode }) => (
  <section id={id} className="mx-auto max-w-6xl space-y-6 px-6 py-16">{children}</section>
);

const LIES = [
  { title: "Tests that don't test", id: "ex-toothless", body: "“Added tests for the retry backoff.” We revert the source change. The tests still pass." },
  { title: "“I didn't touch auth”", id: "ex-scope", body: "The summary says auth is untouched. The diff edits src/auth/session.ts." },
  { title: "“42/42 pass”", id: "ex-count", body: "The summary reports one count. The suite collects another, and an assertion was loosened." },
];

export default async function Home() {
  const store = getStore();
  const examples = new Set((await store.examples()).map((e) => e.id));
  const table = evalTable();
  return (
    <main>
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <a href="/" className="flex items-center gap-2 font-semibold"><Logo /> nocap</a>
        <nav className="flex gap-5 font-mono text-sm text-muted"><a href="/docs">docs</a><a href="/agents">agents</a><a href="https://github.com/shankar7055/NoCap">github</a></nav>
      </header>

      <Section>
        <div className="grid items-center gap-10 lg:grid-cols-2">
          <div className="space-y-6">
            <h1 className="text-5xl font-semibold leading-[1.05] tracking-tight lg:text-6xl">Your agent says the tests cover it. We revert the fix and check.</h1>
            <p className="max-w-xl text-muted">nocap verifies every claim in your coding agent&apos;s summary against the diff and real test runs, then sends every false claim back until the agent proves it. Works with Claude Code, Codex, Cursor, OpenCode, Gemini CLI and Alan. Open models, runs locally, MIT.</p>
            <div className="flex flex-wrap items-center gap-3">
              <a href="#demo" className="rounded-md bg-accent px-4 py-2 font-mono text-sm font-semibold text-black">Try the demo</a>
              <a href="https://github.com/shankar7055/NoCap" className="rounded-md px-4 py-2 font-mono text-sm ring-1 ring-hairline">Star on GitHub</a>
              <CopyPill text="npx @shankywho/nocap demo" />
            </div>
          </div>
          <TerminalReceipt />
        </div>
      </Section>

      <Section>
        <H2>The three lies</H2>
        <div className="grid gap-4 md:grid-cols-3">
          {LIES.map((l) => (
            <a key={l.id} href={examples.has(l.id) ? `/r/${l.id}` : "#"} className="space-y-2 rounded-xl bg-surface p-5 ring-1 ring-hairline hover:ring-accent">
              <h3 className="font-semibold">{l.title}</h3>
              <p className="text-sm text-muted">{l.body}</p>
              <p className="font-mono text-xs text-accent">open the receipt →</p>
            </a>
          ))}
        </div>
      </Section>

      <Section>
        <H2>How it works</H2>
        <ol className="grid gap-4 md:grid-cols-4">
          {[["Extract", "Pull each checkable claim out of the summary."], ["Bind", "Map every claim to files, symbols and tests in the diff."], ["Prove", "Re-run the suite, revert the fix, read the evidence."], ["Receipt", "One verdict per claim: ✓ verified, ✗ contradicted, ! unverifiable."]].map(([t, d], i) => (
            <li key={t} className="rounded-xl bg-surface p-5 ring-1 ring-hairline"><p className="font-mono text-sm text-accent">0{i + 1} {t}</p><p className="mt-2 text-sm text-muted">{d}</p></li>
          ))}
        </ol>
      </Section>

      <Section>
        <H2>Bitecheck</H2>
        <div className="grid gap-4 md:grid-cols-2 font-mono text-sm">
          <pre className="rounded-xl bg-surface p-5 ring-1 ring-hairline"><span className="text-muted">tests at head{"\n"}</span><span className="text-verified">2/2 pass{"\n"}</span></pre>
          <pre className="rounded-xl bg-surface p-5 ring-1 ring-hairline"><span className="text-muted">source reverted, same tests{"\n"}</span><span className="text-contradicted">2/2 STILL PASS → toothless{"\n"}</span></pre>
        </div>
      </Section>

      <Section id="demo">
        <H2>The loop: FAIL → PASS</H2>
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2"><StreamRun endpoint="/api/demo/loop" label="Play the repair loop" /></div>
          <a href={examples.has("ex-gamed") ? "/r/ex-gamed" : "#"} className="space-y-2 rounded-xl bg-surface p-5 ring-1 ring-hairline hover:ring-accent">
            <h3 className="font-semibold">Tried to cheat? Deleting the test doesn&apos;t count.</h3>
            <p className="text-sm text-muted">An agent that deletes the failing test and drops the claim is flagged: repair_by_weakening.</p>
          </a>
        </div>
        <h3 className="pt-6 font-mono text-sm text-muted">OR VERIFY THE DEMO PULL REQUEST</h3>
        <StreamRun endpoint="/api/demo" label="Verify demo/fixture-shop#7" />
      </Section>

      <Section>
        <H2>Built for Alan&apos;s verify loop</H2>
        <p className="max-w-2xl text-muted">The plugin calls <code>verify_claims</code> before an agent declares done and attaches the result as the task&apos;s test report: pass, fail or mixed.</p>
        <pre className="overflow-x-auto rounded-lg bg-surface p-4 text-sm ring-1 ring-hairline">npx @shankywho/nocap init --all</pre>
      </Section>

      <Section>
        <H2>Multi-agent: stop a false claim at the handoff</H2>
        <div className="grid gap-4 md:grid-cols-3 font-mono text-sm">
          <div className="rounded-xl bg-surface p-5 ring-1 ring-hairline"><p className="text-accent">backend</p><p className="text-muted">&quot;Added computeDelay()&quot;</p><p className="text-contradicted">✗ CONTRADICTED</p></div>
          <div className="rounded-xl bg-surface p-5 ring-1 ring-accent"><p className="text-accent">ledger</p><p className="text-muted">.nocap/ledger.jsonl</p><p>facts, warnings, stale</p></div>
          <div className="rounded-xl bg-surface p-5 ring-1 ring-hairline"><p className="text-accent">frontend</p><p className="text-muted">ledger_facts(&quot;computeDelay&quot;)</p><p className="text-unverifiable">! warned before it builds on it</p></div>
        </div>
      </Section>

      <Section><H2>Every agent</H2><CopyPill text="npx @shankywho/nocap init --all" /><AgentTabs /><a href="/agents" className="font-mono text-sm text-accent">See the scorecard →</a></Section>

      <Section>
        <H2>Eval</H2>
        {table ? <pre className="overflow-x-auto rounded-xl bg-surface p-5 text-sm ring-1 ring-hairline">{table}</pre> : <p className="text-muted">Run <code>pnpm eval</code> to generate the table.</p>}
      </Section>

      <Section>
        <H2>Verify a public PR</H2>
        <div className="max-w-2xl"><PrForm /></div>
      </Section>

      <Section>
        <H2>FAQ</H2>
        <dl className="grid gap-6 md:grid-cols-2">
          {[
            ["Does my code leave my machine?", "No. Only the summary and file paths go to the model. Tests and Bitecheck run locally."],
            ["Why not just use CI?", "CI says the suite is green. It does not say the new tests exercise the change, or that the summary is true."],
            ["Which agents?", "Any that can end with a summary. Hooks and MCP cover Claude Code, Codex, Cursor, OpenCode, Gemini CLI and Alan."],
            ["Which models?", "Open models through any OpenAI-compatible endpoint. Offline mode needs none."],
            ["What can't it check?", "Intent, design quality and anything outside the diff and the test runner. Unverifiable claims are marked !, never guessed."],
          ].map(([q, a]) => (<div key={q}><dt className="font-semibold">{q}</dt><dd className="mt-1 text-sm text-muted">{a}</dd></div>))}
        </dl>
      </Section>

      <footer className="mx-auto max-w-6xl border-t border-hairline px-6 py-8 font-mono text-sm text-muted">
        <a href="https://github.com/shankar7055/NoCap">GitHub</a> · <a href="/docs">Docs</a> · MIT
      </footer>
    </main>
  );
}
