import type { Receipt } from "@nocap/core";
import { getStore } from "../src/server/store";
import { Brand, CopyPill, Galley, PrForm, type GalleyData } from "../src/ui/landing";
import { StreamRun } from "../src/ui/StreamRun";

export const dynamic = "force-dynamic";
const REPO = "https://github.com/shankywho/nocap";

function galleyOf(r: Receipt): GalleyData {
  let at = 0;
  return {
    receiptId: r.id,
    overall: r.overall,
    totals: r.totals,
    claims: [...r.claims]
      .sort((a, b) => (a.claim.span?.[0] ?? 0) - (b.claim.span?.[0] ?? 0))
      .map(({ claim, verdict }) => {
        const [from, to] = claim.span ?? [at, at + claim.quote.length];
        const pre = r.input.summary.slice(at, from).trim();
        at = to;
        const b = verdict.bitecheck;
        return {
          id: claim.id,
          pre,
          quote: r.input.summary.slice(from, to).trim(),
          status: verdict.status,
          note:
            b?.reverted?.kind === "testRun"
              ? `Source reverted. ${b.reverted.passed}/${b.reverted.total} selected tests still pass.`
              : verdict.reason,
        };
      }),
  };
}
const Kicker = ({ children }: { children: React.ReactNode }) => (
  <p className="kicker">{children}</p>
);

export default async function Home() {
  const example = await getStore().get("ex-toothless");
  return (
    <main className="field-page">
      <header className="site-nav">
        <a href="/" aria-label="no-cap home">
          <Brand />
        </a>
        <div className="nav-links">
          <a href="#method">Method</a>
          <a href="/docs">Documentation</a>
          <a href={REPO}>Source ↗</a>
        </div>
        <a href="#run" className="nav-run">
          Run a check ↘
        </a>
      </header>

      <section className="hero-sheet">
        <aside className="folio" aria-hidden>
          <span>FIELD NOTE</span>
          <b>001</b>
          <span>LOCAL PROOF</span>
        </aside>
        <div className="hero-copy">
          <Kicker>For teams who read the diff</Kicker>
          <h1>
            <em>“Done”</em> is not
            <br />a test result.
          </h1>
          <p className="hero-lede">
            nocap turns an agent&apos;s final message into evidence you can inspect. It reads the
            claims, checks the diff, and challenges the tests.
          </p>
          <div className="hero-actions">
            <CopyPill text="npx @shankywho/nocap demo" />
            <a href="#method" className="text-link">
              See the method <span>↓</span>
            </a>
          </div>
          <p className="fine-print">MIT licensed · runs in your repository · no account</p>
        </div>
        <div className="hero-proof">
          <div className="paper-label">
            <span>Agent completion note</span>
            <span>Exhibit A</span>
          </div>
          {example ? (
            <Galley data={galleyOf(example.receipt)} />
          ) : (
            <p>Example receipt unavailable.</p>
          )}
          <p className="margin-note">
            <b>↳</b> One claim did not survive contact with the code.
          </p>
        </div>
      </section>

      <section className="statement">
        <p className="statement-mark">✱</p>
        <p>
          Continuous integration can tell you that the build is green.
          <br />
          <strong>It cannot tell you whether the summary is true.</strong>
        </p>
        <small>nocap makes the distinction visible.</small>
      </section>

      <section id="method" className="method-section">
        <div className="method-intro">
          <Kicker>The method</Kicker>
          <h2>
            Every sentence gets
            <br />a burden of proof.
          </h2>
          <p>
            The model may identify claims. It never decides whether they are true. That decision is
            made by executable checks and Git evidence.
          </p>
        </div>
        <ol className="evidence-list">
          <li>
            <span>I.</span>
            <div>
              <h3>Read the summary</h3>
              <p>
                Find the promises: a test was added, a file changed, auth was untouched, the suite
                passed.
              </p>
            </div>
            <b>↘</b>
          </li>
          <li>
            <span>II.</span>
            <div>
              <h3>Bind it to the work</h3>
              <p>Map every promise to the actual diff, source tree, test output, and CI signal.</p>
            </div>
            <b>↘</b>
          </li>
          <li>
            <span>III.</span>
            <div>
              <h3>Try to break the proof</h3>
              <p>Revert the implementation in a disposable worktree. A real test must notice.</p>
            </div>
            <b>↘</b>
          </li>
        </ol>
      </section>

      <section className="bitecheck-section">
        <div className="bitecheck-title">
          <Kicker>Bitecheck</Kicker>
          <h2>
            Remove the fix.
            <br />
            Keep the test.
          </h2>
        </div>
        <div className="terminal-proof">
          <div className="terminal-top">
            <span>nocap / evidence</span>
            <span>test dependency check</span>
          </div>
          <div className="terminal-row">
            <span>01</span>
            <p>run selected tests at head</p>
            <b className="pass">2 / 2 pass</b>
          </div>
          <div className="terminal-row">
            <span>02</span>
            <p>
              revert <code>src/retry.ts</code> in a throwaway worktree
            </p>
            <b>reverted</b>
          </div>
          <div className="terminal-row">
            <span>03</span>
            <p>run the same tests again</p>
            <b className="fail">2 / 2 still pass</b>
          </div>
          <p className="verdict-note">
            <span>✕</span> The test did not depend on the change. The claim is contradicted.
          </p>
        </div>
        <div className="bitecheck-copy">
          <p>
            A passing test can be useless. Bitecheck is a tiny adversarial check: remove the
            implementation, then ask whether the test can tell.
          </p>
          <a href="/r/ex-toothless" className="text-link">
            Read the full receipt <span>↗</span>
          </a>
        </div>
      </section>

      <section id="run" className="run-section">
        <div className="run-heading">
          <Kicker>Try the loop</Kicker>
          <h2>A false claim does not end the conversation.</h2>
          <p>
            nocap writes a repair packet. The next attempt is checked against the original proof
            record, so deleting a test cannot quietly make the problem disappear.
          </p>
        </div>
        <div className="run-console">
          <StreamRun endpoint="/api/demo/loop" label="Play the repair loop" />
        </div>
      </section>
      <section className="pr-section">
        <div>
          <Kicker>Without a checkout</Kicker>
          <h2>Bring a public PR.</h2>
          <p>
            PR mode reads the patch and CI status. Claims that require execution remain{" "}
            <em>unverifiable</em>, never guessed.
          </p>
        </div>
        <PrForm />
      </section>
      <footer className="site-footer">
        <Brand size="small" />
        <p>Proof for code claims.</p>
        <div>
          <a href="/docs">Docs</a>
          <a href="/agents">Scorecard</a>
          <a href={REPO}>GitHub ↗</a>
        </div>
      </footer>
    </main>
  );
}
