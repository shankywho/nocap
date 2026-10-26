# HANDOFF (after P8 minus init --all)

## Done
- P0-P4 + P5. 164 tests green, lint/typecheck clean.
- P4: verifiers, tamper, policy, repair, renderers, static `verify()` pipeline, `--no-exec` goldens (`test/__golden__/*.noexec.json`, UPDATE_GOLDEN=1 regenerates).
- P5: `runners/` (detect, run, parseJest incl. Vitest, parseJunit, types), `bitecheck/` (select, run), `exec/stage.ts` (`createExecStage`, allow-listed build commands, shared head worktree, `dispose`).
- `test/pipeline.exec.test.ts`: all 8 scenarios match expected.json with real git + Vitest (toothless -> toothless, honest -> bites, untracked -> import_only), no leftover worktrees, runner-missing case.

- P6 CLI (`apps/cli`): `check` (all §10.1 flags except chain/since-last), `demo`, `repair`, `publish`; exit codes 0/1/2/3; saves `.nocap/receipts/<id>.{json,md}` + `.git/info/exclude`; spinner/--verbose on stderr. `test/check.test.ts` covers integration test 9.
- Terminal renderer now follows §1.4 layout (goldens `*.terminal.txt`, `*.md`).
- `pnpm demo` root script points at scripts/demo.ts (not written); `nocap demo` works via build-fixtures.

- P7: `scripts/eval.ts` prints the exact §1.5 table (B0 0/5, B1 0/5, B2 3/5, B3 5/5, 0 false accusations), writes `eval/results.md` (keeps `<!-- extra-evals -->` tail). `pnpm demo <scenario>` works (loop/handoff pending). Shared `scripts/lib/run-scenario.ts`.
- P8b: proof chains + repair loop. core `loop/{text,chain,antiGaming,driver}.ts`; `verify({chain:{id:'auto'|'new'|id,store}})` continues after FAIL/MIXED keeping the parent's base; items keyed by normalised quote; statuses fixed/retracted/dropped_silently/repair_by_weakening; gamed => overall FAIL + flags. `Retracted: <quote>` is blanked before extraction.
- CLI: `check --chain`, `loop --agent-cmd "... {repair_file}" [--summary-from stdout|file:p] [--max n]`; repair md header carries `chain <id>`. `scripts/mock-agent.ts` applies `fixtures/scenarios/<n>/repair/`. New scenario `toothless_gamed`.
- eval.ts now prints the repair-loop table (all 5 rows match spec) and fails if a row deviates. Handoff eval still pending (P8c).
- Tests: apps/cli/test/loop.test.ts (integration 13-15), packages/core/test/loop.test.ts.

- P8: core `adapters/local.ts` = composition root (`verifyLocal`, `bitecheckLocal`, `checkScopeLocal`, rc/store helpers) used by CLI, hook and MCP. CLI: `hook claude` (Stop hook; report-only; NOCAP_BLOCK=1 blocks max 2/session), `init claude [--write --user]` (merge-safe), `mcp`. MCP (`packages/mcp/src/{server,tools}.ts`): verify_claims, get_repair, bitecheck, check_scope (ledger_facts, ledger_check, scorecard come with P8c). Alan plugin in `plugins/nocap` + `docs/ALAN.md`. Tests: hook.test.ts, plugin.test.ts, mcp.test.ts.
- Remaining P8: `init --all` (§8.10) and `nocap bitecheck`/`chain` CLI commands.

## Notes
- CLI could not add deps offline (pnpm store mismatch): no zod/execa in apps/cli; uses node:child_process and hand validation.
- Shells pass child env to `createExecStage({env})`; core never reads process.env.
- Vitest `-t` filter uses leaf test titles (full names did not match).
- Chain fields in receipts are first-attempt stubs (real chain store is P8b).
- Unverifiable verdicts do not carry the bitecheck field (display only; could attach).
- pytest/jest paths untested against real projects (parsers have samples only).

## Next
`init --all` (§8.10, integration test 19), `nocap bitecheck`/`chain` commands. Then P8c (actor, --since-last, ledger, handoff, scorecard, scenario 10). Read NOCAP_BUILD.md §3.3, §8.8-8.10, §10.3-10.4.
