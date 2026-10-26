# nocap for Alan

An Alan plugin that lets agents verify their own completion summaries before they hand work back.

- `mcp.json` starts the nocap MCP server (`npx -y nocap mcp`).
- `skills/nocap-verify` teaches the protocol: `ledger_facts` → `bitecheck` → `verify_claims` → `get_repair` loop → persist the result as the task's test report.

See [docs/ALAN.md](../../docs/ALAN.md) for install steps and the exact test-report mapping.
