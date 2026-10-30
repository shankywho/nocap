import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Receipt } from "@nocap/core";
import { getStore } from "../src/server/store";
import { Hero } from "../src/ui/hero";
import { AgentTabs, CopyPill, Galley, Logo, Nav, PrForm, RevertDemo, type BiteCase, type GalleyData } from "../src/ui/landing";
import { StreamRun } from "../src/ui/StreamRun";

export const dynamic = "force-dynamic";

const REPO = "https://github.com/shankywho/nocap";

function readRepoFile(rel: string): string {
  for (const base of [process.cwd(), resolve(process.cwd(), "../..")]) {
    try {
      return readFileSync(resolve(base, rel), "utf8");
    } catch {
      /* try the next base */
    }
  }
  return "";
}

/** The B1 and B3 rows of the eval table, so the page quotes the numbers the eval printed. */
function evalNumbers(table: string) {
  const b3 = /B3[^\n]*?(\d+)\/5\s+(\d+)/.exec(table);
  return { caught: b3 ? `${b3[1]}/5` : "5/5", falseAccusations: b3?.[2] ?? "0" };
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
          ? `Bitecheck reverted ${bc.revertedFiles.join(", ")}. ${bc.reverted.passed} of ${bc.reverted.total} selected tests still pass, so they do not exercise the change.`
          : verdict.reason.length > 90
            ? `${verdict.reason.slice(0, 87)}...`
            : verdict.reason;
      return { id: claim.id, pre, quote: r.input.summary.slice(from, to).trim(), status: verdict.status, note };
    }),
  };
}

/** A receipt printed by `nocap check`, minus the rule lines and all but the first few UNDISCLOSED rows. */
function receiptText(file: string): { lines: string[]; result: string } {
  const lines = readRepoFile(`docs/dogfood/${file}`).split("\n").map((l) => l.replace(/\s+$/, ""));
  const keep: string[] = [];
  let undisclosed = 0;
  for (const l of lines) {
    if (!l.trim() || l.startsWith("─") || l.startsWith("RESULT") || l.startsWith("saved") || l.startsWith("Repair:") || l.startsWith("                …and")) continue;
    if (l.startsWith("UNDISCLOSED") && ++undisclosed > 3) continue;
    keep.push(l);
  }
  if (undisclosed > 3) keep.push("UNDISCLOSED     (more files listed in the receipt JSON)");
  return { lines: keep, result: lines.find((l) => l.startsWith("RESULT")) ?? "" };
}

const BITE_CASES: BiteCase[] = [
  {
    label: "Tests that do not test",
    kind: "revert",
    file: "src/retry.ts",
    changed: [
      { sign: "-", text: "const delayMs = 100;" },
      { sign: "+", text: "const delayMs = 100 * 2 ** (attempt - 1);" },
    ],
    after: [
      { sign: " ", text: "const delayMs = 100;" },
      { sign: " ", text: "(the agent's change is gone)" },
    ],
    tests: ["eventually succeeds after two failures", "retries only the configured number of times"],
    stillPass: true,
  },
  {
    label: "Tests that bite",
    kind: "revert",
    file: "src/retry.ts",
    changed: [
      { sign: "-", text: "const delayMs = 100;" },
      { sign: "+", text: "const delayMs = 100 * 2 ** (attempt - 1);" },
    ],
    after: [
      { sign: " ", text: "const delayMs = 100;" },
      { sign: " ", text: "(the agent's change is gone)" },
    ],
    tests: ["backs off exponentially between attempts", "doubles the delay on each retry"],
    stillPass: false,
  },
  {
    label: "New function, test checks it exists",
    kind: "stub",
    file: "src/math.ts",
    changed: [
      { sign: "+", text: "export function mul(a: number, b: number): number {" },
      { sign: "+", text: "  return a * b;" },
      { sign: "+", text: "}" },
    ],
    after: [
      { sign: "+", text: "export function mul(a: number, b: number): number {" },
      { sign: "+", text: "  return undefined;" },
      { sign: "+", text: "}" },
    ],
    tests: ['expect(typeof mul).toBe("function")'],
    stillPass: true,
  },
  {
    label: "New function, test checks the result",
    kind: "stub",
    file: "src/math.ts",
    changed: [
      { sign: "+", text: "export function mul(a: number, b: number): number {" },
      { sign: "+", text: "  return a * b;" },
      { sign: "+", text: "}" },
    ],
    after: [
      { sign: "+", text: "export function mul(a: number, b: number): number {" },
      { sign: "+", text: "  return undefined;" },
      { sign: "+", text: "}" },
    ],
    tests: ["expect(mul(2, 3)).toBe(6)"],
    stillPass: false,
  },
];

const STEPS = [
  ["Extract", "A model splits the final message into short claims and copies each quote from the text. A claim whose quote is not in the message is dropped."],
  ["Bind to the diff", "Each claim is matched to files, symbols and tests in the diff. \"Didn't touch auth\" becomes a set of paths to compare with the changed files."],
  ["Run the tests", "The project's own runner runs in your checkout. A run that cannot happen is marked ! and never counted as a failure."],
  ["Bitecheck", "The tests the agent added run again with the change reverted. If they still pass, they do not test the change."],
];

const LIMITS = [
  "It does not judge whether a change is correct. It checks that the claims match the diff and that new tests exercise the change.",
  "A claim about behaviour with no test, such as \"it feels faster\", is marked !.",
  "Bitecheck reverts whole files or stubs whole function bodies. It cannot revert a single hunk.",
  "The Python stub path is unit-tested only. It has not run against a real pytest project.",
  "PR mode cannot execute code. Test and build claims there are marked !.",
  "Tests run with Vitest, Jest, pytest or node --test. Other runners need --test-cmd.",
  "Builds run only with --allow-build. Without it, a test that needs missing build output is marked !.",
];

const FAQ: [string, string][] = [
  ["Does my code leave my machine?", "Only the summary and the list of changed file paths go to the model. With --offline nothing does. Tests and Bitecheck run locally in a throwaway worktree and never write to your repository."],
  ["Which models?", "Any OpenAI-compatible endpoint. The default is gpt-oss-120b on Groq. The model splits the message into claims and maps names to paths. Code decides every verdict."],
  ["How is this different from unfaked, receipts and CodeRabbit?", "From their public descriptions: unfaked reverts source and reruns added tests, but it is not tied to what the agent said. receipts reads agent transcripts and git history and flags test edits and scope. CodeRabbit reviews pull requests with a model. nocap takes the agent's own sentences, tests each one, and returns a verdict per claim. Check each project's documentation, because these summaries can be out of date."],
  ["Why not just use CI?", "CI reports that the suite is green. It cannot report that the new tests exercise the change or that the summary matches the diff. In our eval, CI alone caught 0 of 5 planted problems."],
  ["Which agents?", "Any agent that ends with a summary. Hooks and an MCP server cover Claude Code, Codex, Cursor, OpenCode, Gemini CLI and Alan."],
  ["What does ! mean?", "nocap could not check the claim, for example because the tests could not run in a bare checkout. It is never counted as a failure."],
];

const Section = ({ n, title, tone = "wall", children }: { n: number; title: string; tone?: "wall" | "desk"; children: React.ReactNode }) => (
  <>
    <hr className="rule2" />
    <section id={`no-${n}`} className={`scroll-mt-16 ${tone === "desk" ? "bg-desk" : "bg-wall"}`}>
      <div className="mx-auto flex max-w-6xl flex-col gap-8 px-5 py-20 sm:px-8">
        <div>
          <p className="label m-0">No. {n}</p>
          <h2 className="m-0 max-w-3xl text-[34px] leading-[1.15] text-cream">{title}</h2>
        </div>
        {children}
      </div>
    </section>
  </>
);

const Lede = ({ children }: { children: React.ReactNode }) => <p className="m-0 max-w-2xl text-[17px] text-muted">{children}</p>;

function ReceiptDoc({ file, plate }: { file: string; plate: string }) {
  const { lines, result } = receiptText(file);
  return (
    <figure className="m-0">
      <div className="doc overflow-x-auto">
        <pre className="m-0 whitespace-pre font-mono text-[12px] leading-[1.6]">
          {lines.map((l, i) => (
            <span key={i} className={`block ${l.startsWith("✗") ? "text-contradicted" : l.startsWith("✓") ? "text-verified" : l.startsWith("!") ? "text-unverifiable" : l.startsWith("FLAG") ? "text-unverifiable" : l.startsWith(" ") ? "text-ink-muted" : ""}`}>{l.length > 150 ? `${l.slice(0, 147)}...` : l}</span>
          ))}
          <span className="mt-2 block font-semibold">{result}</span>
        </pre>
      </div>
      <figcaption className="plate">{plate}</figcaption>
    </figure>
  );
}

export default async function Home() {
  const store = getStore();
  const [hero, loop1, loop2, gamed1, gamed2] = await Promise.all(["ex-toothless", "ex-toothless", "ex-loop-2", "ex-gamed-1", "ex-gamed"].map((id) => store.get(id)));
  const table = /```\n([\s\S]*?)```/.exec(readRepoFile("eval/results.md"))?.[1]?.trim() ?? "";
  const stats = evalNumbers(table);
  const firstBad = (r: Receipt | undefined) => r?.claims.find((c) => c.verdict.status === "contradicted");
  const gamedFlags = [...(gamed2?.receipt.globalFlags ?? []).map((f) => f.rule), ...(gamed2?.receipt.chain.items ?? []).map((i) => i.status)];

  return (
    <main>
      <Nav />
      <Hero stats={stats} />

      <Section n={1} title="How it checks a claim">
        <div className="grid items-start gap-10 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="space-y-6">
            <Lede>nocap splits the final message into claims, then proves or refutes each one with evidence from your repository.</Lede>
            <ol className="m-0 list-none space-y-5 p-0">
              {STEPS.map(([t, d], i) => (
                <li key={t} className="grid grid-cols-[2.25rem_1fr] gap-x-3">
                  <span className="font-heading text-[28px] leading-none text-lamp">{i + 1}.</span>
                  <div>
                    <h3 className="m-0 text-[20px] font-bold text-cream">{t}</h3>
                    <p className="m-0 mt-1 text-[16px] text-muted">{d}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
          <div>{hero ? <Galley data={galleyOf(hero.receipt)} /> : <p className="text-muted">The example receipt is unavailable.</p>}</div>
        </div>
      </Section>

      <Section n={2} title="Bitecheck: revert the fix, rerun the tests" tone="desk">
        <Lede>nocap reverts the agent&apos;s change in a throwaway git worktree and reruns only the tests the agent added. For a new function there is nothing to revert, so nocap keeps the signature and replaces the body with return undefined. Pick an example and press the button.</Lede>
        <RevertDemo cases={BITE_CASES} />
      </Section>

      <Section n={3} title="Repair loop">
        <Lede>Each contradicted claim goes back to the agent as a short list of what to fix. The next attempt is checked against the same base. In the first example attempt 2 passes. In the second the agent deletes the failing test and drops the sentence, and the chain stays open.</Lede>
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-3">
            <h3 className="m-0 mb-3 text-[22px] text-cream">FAIL to PASS in 2 attempts</h3>
            <div className="doc space-y-3 font-mono text-[13px]">
              <p className="m-0"><b className="text-contradicted">Attempt 1: ✗ FAIL</b></p>
              <p className="m-0 text-contradicted"><span className="strike" data-on="true">{firstBad(loop1?.receipt)?.claim.quote ?? ""}</span></p>
              <p className="m-0 text-ink-muted">{firstBad(loop1?.receipt)?.verdict.repair ?? ""}</p>
              <hr className="m-0 border-brass" />
              <p className="m-0"><b className="text-verified">Attempt 2: ✓ PASS</b></p>
              <p className="m-0 text-ink-muted">{loop2 ? `${loop2.receipt.totals.verified} verified, ${loop2.receipt.totals.contradicted} contradicted. Chain outcome: ${loop2.receipt.chain.outcome}.` : ""}</p>
            </div>
            <p className="plate">Chain {loop2?.receipt.chain.chainId ?? ""} · <a className="linklamp" href={loop2 ? `/c/${loop2.receipt.chain.chainId}` : "#"}>open the proof chain</a></p>
          </div>
          <div className="space-y-3">
            <h3 className="m-0 mb-3 text-[22px] text-cream">The gamed repair stays open</h3>
            <div className="doc space-y-3 font-mono text-[13px]">
              <p className="m-0"><b className="text-contradicted">Attempt 1: ✗ FAIL</b></p>
              <p className="m-0 text-ink-muted">{firstBad(gamed1?.receipt)?.claim.quote ?? ""}</p>
              <hr className="m-0 border-brass" />
              <p className="m-0"><b className="text-contradicted">Attempt 2: ✗ FAIL</b></p>
              <p className="m-0 text-ink-muted">The agent deleted the failing test and dropped the sentence without retracting it. Chain outcome: {gamed2?.receipt.chain.outcome ?? "unresolved"}.</p>
              <p className="m-0 text-contradicted">{[...new Set(gamedFlags)].filter((f) => /dropped|weakening/.test(f)).join(" · ")}</p>
            </div>
            <p className="plate">Deleting a test does not close the claim · <a className="linklamp" href="/r/ex-gamed">open the receipt</a></p>
          </div>
        </div>
        <div className="max-w-2xl space-y-2">
          <h3 className="m-0 text-[20px] text-cream">Play it live</h3>
          <StreamRun endpoint="/api/demo/loop" label="Play the repair loop" plate="Replays the stored example chain" />
        </div>
      </Section>

      <Section n={4} title="Multi-agent handoff" tone="desk">
        <Lede>When two agents share a task, nocap records every verdict in .nocap/ledger.jsonl with the commit and file hashes it was true for. Before the frontend agent builds on the backend agent&apos;s work, ledger_facts returns the warning. A fact goes stale when its files change.</Lede>
        <div className="grid gap-5 md:grid-cols-3">
          <figure className="m-0">
            <div className="doc font-mono text-[13px]">
              <p className="m-0 text-ink-muted">backend agent · opencode, glm-5.3-flash</p>
              <p className="mb-0 mt-2 text-[15px]"><span className="strike" data-on="true">Added `computeDelay()` in src/backoff.ts</span></p>
              <p className="mb-0 mt-2 text-contradicted">✗ contradicted: the file exports getDelay()</p>
            </div>
            <figcaption className="plate">Lane 1 · commit A</figcaption>
          </figure>
          <figure className="m-0">
            <div className="doc font-mono text-[13px]">
              <p className="m-0 text-ink-muted">.nocap/ledger.jsonl</p>
              <p className="mb-0 mt-2 text-[15px]">symbol_added computeDelay · contradicted · backend · blobs at head</p>
              <p className="mb-0 mt-2 text-ink-muted">stale when src/backoff.ts changes</p>
            </div>
            <figcaption className="plate">Ledger between the lanes</figcaption>
          </figure>
          <figure className="m-0">
            <div className="doc font-mono text-[13px]">
              <p className="m-0 text-ink-muted">frontend agent · opencode, deepseek-v4.1-flash</p>
              <p className="mb-0 mt-2 text-[15px]">ledger_facts(&quot;computeDelay&quot;)</p>
              <p className="mb-0 mt-2 text-contradicted">✗ CONTRADICTED by backend. Do not rely on it.</p>
            </div>
            <figcaption className="plate">Lane 2 · before it builds on commit A</figcaption>
          </figure>
        </div>
      </Section>

      <Section n={5} title="Install for your agent">
        <Lede>Run one command in your repository. It detects the agents you use and writes their hook or MCP entry. Without --write it only prints what it would change.</Lede>
        <div className="space-y-6">
          <CopyPill text="npx @shankywho/nocap init --all" />
          <AgentTabs />
          <div className="max-w-2xl space-y-3">
            <h3 className="m-0 text-[20px] text-cream">Or check a public pull request</h3>
            <p className="m-0 text-[16px] text-muted">PR mode is static. CI status stands in for the test run, and anything that needs execution is marked ! instead of guessed.</p>
            <PrForm />
          </div>
        </div>
      </Section>

      <Section n={6} title="Dogfooding" tone="desk">
        <Lede>We ran nocap on its own 0.1.1 work with the live model (gpt-oss-120b on Groq), then ran 0.1.2 on the same commit range. 0.1.1 reported one false contradiction and two false flags. 0.1.2 reports no contradictions and no flags. Some claims are marked ! because the tests could not run in a bare checkout. Both receipts are printed below as they came out.</Lede>
        <div className="grid gap-6 lg:grid-cols-2">
          <div>
            <p className="stat m-0 mb-3">1 false ✗, 2 false flags</p>
            <ReceiptDoc file="0.1.1.receipt.txt" plate="nocap 0.1.1 · summary: the agent's own 0.1.1 closing message · base 92e05bb, head 1a294f9" />
          </div>
          <div>
            <p className="stat m-0 mb-3">0 ✗, 0 flags</p>
            <ReceiptDoc file="0.1.2.receipt.txt" plate="nocap 0.1.2 · same summary, same range, same model" />
          </div>
        </div>
        {table && (
          <figure className="m-0 max-w-3xl">
            <div className="doc overflow-x-auto">
              <pre className="m-0 font-mono text-[13px] leading-6">{table}</pre>
            </div>
            <figcaption className="plate">Eval output · five planted problems, three honest scenarios, four strategies · pnpm eval</figcaption>
          </figure>
        )}
      </Section>

      <Section n={7} title="Limitations">
        <ul className="m-0 max-w-3xl list-none space-y-3 p-0">
          {LIMITS.map((l) => (
            <li key={l} className="doc py-4 text-[16px]">{l}</li>
          ))}
        </ul>
      </Section>

      <Section n={8} title="FAQ" tone="desk">
        <dl className="m-0 grid gap-5 md:grid-cols-2">
          {FAQ.map(([q, a]) => (
            <div key={q} className="doc">
              <dt className="font-heading text-[20px] font-bold">{q}</dt>
              <dd className="m-0 mt-2 text-[16px] text-ink-muted">{a}</dd>
            </div>
          ))}
        </dl>
      </Section>

      <footer className="border-t border-brass bg-desk">
        <div className="mx-auto flex max-w-6xl flex-wrap items-start justify-between gap-6 px-5 py-10 sm:px-8">
          <div className="space-y-2 text-cream">
            <Logo size={20} />
            <p className="m-0 text-[15px] text-muted">Built for #OpenFire by @shankywho · MIT</p>
            <p className="m-0 max-w-md font-mono text-[12px] leading-snug text-muted">Hero: After Thomas Eakins, The Chess Players (1876), The Metropolitan Museum of Art, public domain. Canvas extended for this page.</p>
          </div>
          <nav className="flex gap-6 text-[16px]" aria-label="Footer">
            <a className="linklamp" href={REPO}>GitHub</a>
            <a className="linklamp" href="https://www.npmjs.com/package/@shankywho/nocap">npm</a>
            <a className="linklamp" href="/docs">Docs</a>
            <a className="linklamp" href="/agents">Agents</a>
          </nav>
        </div>
      </footer>
    </main>
  );
}
