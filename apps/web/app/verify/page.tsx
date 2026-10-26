import { StreamRun } from "../../src/ui/StreamRun";

export const dynamic = "force-dynamic";

export default async function VerifyPage({ searchParams }: { searchParams: Promise<{ pr?: string; summary?: string; demo?: string }> }) {
  const q = await searchParams;
  const demo = q.demo !== undefined || !q.pr;
  return (
    <main className="mx-auto max-w-3xl space-y-6 px-6 py-10">
      <p className="font-mono text-sm text-accent">NOCAP · verify</p>
      <h1 className="text-3xl font-semibold tracking-tight">{demo ? "Demo PR: demo/fixture-shop#7" : "Verifying a pull request"}</h1>
      <p className="text-sm text-muted">Static checks only in PR mode. CI status stands in for the test run. Proving tests bite needs <code>npx @shankywho/nocap check</code> locally.</p>
      <StreamRun
        endpoint={demo ? "/api/demo" : "/api/verify-pr"}
        body={demo ? undefined : { prUrl: q.pr, ...(q.summary ? { summary: q.summary } : {}) }}
        autostart
        label="Verify"
      />
    </main>
  );
}
