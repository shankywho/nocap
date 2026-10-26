# Prior art

> Descriptions below come from the build spec and were **not** re-checked against each project's current README. Open each project before quoting this table, and fix any line that is wrong. Do not misrepresent a competitor.

| Tool | What it does | How nocap differs |
|---|---|---|
| Jasowills/receipts | Claude Code and OpenCode transcripts plus git; test-edit and scope flags; GitHub Action | Agent-agnostic summary input; execution proof bound to each sentence; semantic scope mapping |
| receipts-py | Regex claim checks, no LLM | Claim-bound execution; open-model extraction with a quote guard |
| unfaked (`--deep`) | Reverts source and re-runs added tests; claim-agnostic | Resolves which tests the agent's sentence refers to and reports per claim; also scope, counts and CI |
| truth / did-it | MCP fact-checkers with ledgers | Revert-based proof; Alan test-report output |
| groundtruth / cngx | Re-run tests, catch stubs, block merges | Denominator check; tamper flags tied to the claim |
| claimcheck / acv | Per-sentence diff verdicts, transcript-bound | Execution proofs; semantic scope |
| crossexamine | Cross-vendor LLM review of transcripts | No LLM judges; deterministic verdicts |
| testreceipt | "tests pass" in PR bodies versus CI | PR mode does this, and local mode proves more |
