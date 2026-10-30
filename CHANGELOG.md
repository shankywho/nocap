# Changelog

All notable changes to this project are documented here. The format follows Keep a Changelog and the project uses Semantic Versioning.

## [0.1.2]

### Safety (incident)
- nocap must never modify the user's real repo. A Bitecheck `pnpm -r build` in the worktree ran `pnpm install` through the linked `node_modules` and rewired the user's dependency tree. Fixed in layers:
  - **Builds are opt-in** (`--allow-build`, or `NOCAP_ALLOW_BUILD=1`; default off). Without it, missing workspace build output gives `environment` (!), and summary-requested commands (`build_pass`) are not run. MCP and hooks cannot opt in by themselves.
  - **No linked `node_modules` for runs that write.** Worktrees clone dependency directories (APFS `cp -c`, reflink) when they can; otherwise tests use a real `node_modules` whose entries are links, with manager state and caches left out. A build needs a clone, or a copy under a size cap; if neither is possible the build is skipped (`environment`). Absolute workspace links in a clone are re-pointed at the worktree's own packages.
  - **No-install guard for every package manager**: pnpm (`pnpm_config_verify_deps_before_run=false`, offline), npm (offline, no audit, no lockfile), yarn berry (network off, immutable installs), and `PYTHONDONTWRITEBYTECODE` for a linked `.venv`. A warning is printed if `node_modules/.modules.yaml` changes during a run.
  - **Invariant test, run in CI**: `safety.invariant.test.ts` snapshots the real repo (`.modules.yaml` hash, link targets, every file in `node_modules`, manifest mtimes) before and after full monorepo Bitecheck runs whose tests and build write into `node_modules`; it must be identical.

### Fixed
- **No more false accusations from setup problems.** `tests_pass` runs the project's own runner in place when head is the working tree (a snapshot, or a clean HEAD) and uses a worktree only for Bitecheck. A run whose failures are all module or package resolution errors, or that collects under half of what the project collects in place, is `!` (environment), never ✗. Bitecheck head runs that cannot resolve packages are `environment`, never `broken_on_head`.
- Bitecheck in a monorepo links every workspace package's `node_modules` into the worktree (workspace siblings point at the worktree's copy), and rebuilds workspace output before the head run and again after the revert.
- One source of truth for test totals: a file that fails to load counts as one failed test, so `passed + failed + skipped = total` in every report.
- `test_config_changed` fires only on real config files (vitest/jest config, pytest.ini, pyproject.toml, conftest.py, tsconfig*, package.json test scripts, .github/workflows). The skip, only, trivial-assertion, forced-exit and env-sniffing rules ignore matches inside string and template literals, comments and regex literals.

### Added
- Checkable housekeeping claims: "bumped version to X" is checked against the version diff, and "regenerated goldens/snapshots" attaches the changed golden or snapshot files as evidence (so they stop showing as UNDISCLOSED).
- `nocap demo --live` uses the configured key and names the model in RESULT; the default demo stays deterministic and offline.

## [0.1.1]

### Fixed
- Offline extraction is never silent: `nocap config set llm-key` / `config get`, key lookup from `NOCAP_LLM_API_KEY`, `GROQ_API_KEY`, `LLM_API_KEY` or `~/.config/nocap/config.json` (mode 600), a one-line banner when no key is found, and `· offline` or the model in the RESULT line.
- Regex extractor: "Added/Implemented `x()` in/to <path>" yields `symbol_added` and `file_modified`.
- Snapshots and ChangeSets always exclude `node_modules`, `.venv`, `venv`, `dist`, `build`, `.next`, `.turbo`, `coverage`, `.nocap`, `.cache` and `*.log`, even without a `.gitignore`. UNDISCLOSED is capped at 15 lines, and lockfiles collapse into one quiet line.
- Bitecheck no longer deletes newly added functions (which made any test fail with an import error). It stubs their bodies to `return undefined` (`return None` in Python): `bites (stub)` / `toothless (stub)`. Modified pre-existing functions are put back to their base bodies.
- Fixture builder can no longer commit to the main repository.
- Package metadata points at github.com/shankywho/nocap.

### Added
- Support for `node --test` projects (junit reporter, one process per file).

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
- Hosted Bitecheck (P12). The Prisma store is written and tested against a fake client only; it has not run against a real database. See docs/decisions.md.
