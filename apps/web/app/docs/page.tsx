import help from "../../src/generated/cli-help.json";

export const metadata = { title: "nocap docs" };

const Pre = ({ children }: { children: string }) => <pre className="overflow-x-auto rounded-lg bg-surface p-4 text-sm ring-1 ring-hairline">{children}</pre>;
const H = ({ id, children }: { id: string; children: string }) => <h2 id={id} className="pt-10 text-2xl font-semibold tracking-tight">{children}</h2>;
const P = ({ children }: { children: React.ReactNode }) => <p className="text-muted">{children}</p>;

const TOC = ["install", "cli", "claude-code", "mcp", "alan", "pr-mode", "config", "privacy", "faq"];

export default function Docs() {
  const cmds = help.commands as Record<string, string>;
  return (
    <main className="mx-auto max-w-3xl space-y-4 px-6 py-10">
      <p className="font-mono text-sm text-accent"><a href="/">nocap</a> · docs</p>
      <h1 className="text-4xl font-semibold tracking-tight">Documentation</h1>
      <nav className="flex flex-wrap gap-3 font-mono text-sm text-muted">{TOC.map((t) => <a key={t} href={`#${t}`}>{t}</a>)}</nav>

      <H id="install">Install</H>
      <P>Needs Node 20+ and a git repository. No account. Try it on a built-in scenario first.</P>
      <Pre>{"npx nocap demo toothless\nnpx nocap check --summary-file summary.md"}</Pre>

      <H id="cli">CLI reference</H>
      <P>Generated from the commander help text. Exit codes: 0 pass, 1 contradicted, 2 usage or input error, 3 tamper with --strict.</P>
      <Pre>{help.root}</Pre>
      {Object.entries(cmds).map(([name, text]) => (
        <div key={name} className="space-y-1"><h3 className="font-mono text-sm text-accent">nocap {name}</h3><Pre>{text}</Pre></div>
      ))}

      <H id="claude-code">Claude Code hook</H>
      <P>A Stop hook checks the agent&apos;s final message. It reports by default. Set NOCAP_BLOCK=1 to block the agent on a ✗ (at most twice per session).</P>
      <Pre>{"npx nocap init claude --write          # project .claude/settings.json\nnpx nocap init claude --write --user   # ~/.claude/settings.json"}</Pre>

      <H id="mcp">MCP server</H>
      <P>Seven tools over stdio: verify_claims, get_repair, bitecheck, check_scope, ledger_facts, ledger_check, scorecard.</P>
      <Pre>{'{ "mcpServers": { "nocap": { "command": "npx", "args": ["-y", "nocap", "mcp"] } } }'}</Pre>
      <P>One command wires every agent it finds: <code>npx nocap init --all</code> (dry run by default; add --write).</P>

      <H id="alan">Alan plugin</H>
      <P>Add <code>plugins/nocap</code> to your Alan workspace. The agent calls ledger_facts at the start of a multi-agent task, bitecheck after writing tests, verify_claims before saying done, and get_repair after a fail. Results map to Alan&apos;s test report: PASS, FAIL and MIXED become pass, fail and mixed.</P>

      <H id="pr-mode">PR mode</H>
      <P>Paste a public PR on the landing page or POST /api/verify-pr. PR mode is static: CI status stands in for the test run, and tests_added, bug_fixed and build_pass are marked ! because proving them needs execution. Run <code>npx nocap check</code> locally for the full proof.</P>

      <H id="config">Configuration</H>
      <P>Optional <code>.nocaprc.json</code> at the repo root.</P>
      <Pre>{'{\n  "scope": { "auth": ["src/auth/**", "src/middleware/session.ts"] },\n  "roleScopes": { "backend": ["src/server/**"] },\n  "testCommand": "pnpm test --reporter=json",\n  "testFormat": "jest"\n}'}</Pre>

      <H id="privacy">Privacy</H>
      <P>Only the summary and file paths go to the model, never file contents. Tests and Bitecheck run locally in a throwaway git worktree. Published receipts are public by link; delete one with the token returned at publish time. There are no accounts.</P>

      <H id="faq">FAQ</H>
      <P>Why ! and not ✗? A claim nocap cannot check is never called false. It is marked ! and says what would prove it.</P>
      <P>Can an agent game it? Deleting a failing test or dropping a claim without retracting it is flagged repair_by_weakening and fails the chain.</P>
    </main>
  );
}
