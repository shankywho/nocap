# Changelog

All notable changes to this project are documented here. The format follows Keep a Changelog and the project uses Semantic Versioning.

## [0.1.0]

### Added
- Engine (`packages/core`): claim extraction with a quote guard, scope mapping, static verifiers, tamper flags, undisclosed changes, verdict policy and repair packets.
- Bitecheck: reverts the source change in a temporary worktree and re-runs the tests the agent added. Execution stage with Vitest, Jest and pytest parsers.
- CLI: `check`, `demo`, `repair`, `publish`, `loop`, `bitecheck`, `chain`, `handoff`, `scorecard`, `hook claude`, `init [--all]`, `mcp`. Exit codes 0/1/2/3.
- Proof chains, anti-gaming (`dropped_silently`, `repair_by_weakening`) and the repair loop driver.
- Multi-agent: actor on every receipt, `check --since-last`, claim ledger with staleness, `handoff`, cross-agent scope warning, scorecard.
- MCP server with 7 tools, Claude Code Stop hook, Alan plugin and `docs/ALAN.md`.
- Web (`apps/web`): receipts, proof chains, scorecard, `/verify` with SSE, PR mode over GitHub patches, demo and loop demo streams, OG cards, landing, `/docs`. In-memory store seeded from `examples/`.
- Eval: B0-B3 table, repair-loop table and handoff eval (`pnpm eval`).

### Also added
- `hook codex` and `hook gemini`, GitHub Action, leakage tests (secrets, home paths, env, web responses).

### Not included
- Prisma store, Playwright smoke test, hosted Bitecheck. See DECISIONS.md.
