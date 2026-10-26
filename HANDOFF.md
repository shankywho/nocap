# HANDOFF (after P8c)

## Done
- P0-P8c complete. 228 tests green, lint + typecheck clean, `pnpm eval` exits 0 (B3 5/5, 0 false accusations, repair table, handoff: surfaced yes, attribution errors 0).
- P4: verifiers, tamper, policy, repair, renderers, static `verify()`; `--no-exec` goldens (`UPDATE_GOLDEN=1` regenerates).
- P5: `runners/`, `bitecheck/`, `exec/stage.ts`. P6 CLI: `check`, `demo`, `repair`, `publish`, exit codes 0/1/2/3, receipts in `.nocap/receipts`.
- P7: `scripts/eval.ts` (B0-B3 + repair loop + handoff), writes `eval/results.md`.
- P8: `adapters/local.ts` composition root; `hook claude`, `init claude`, `init --all`, `mcp` (7 tools), `bitecheck`, `chain`, Alan plugin + `docs/ALAN.md`.
- P8b: proof chains, anti-gaming, `loop` driver, mock agent, scenario 9.
- P8c: `ledger/{ledger,query}.ts`, `scorecard/aggregate.ts`, `check --since-last`, actor flags, cross_agent_overlap flag, `nocap handoff`, `nocap scorecard` (`commands/team.ts`), scenario 10 `handoff` (stages/), `pnpm demo handoff`. Tests: `mcp/test/handoff.test.ts` (16, 17, 18), `core/test/scorecard.test.ts` (20).

## Notes
- CLI could not add deps offline: no zod/execa in apps/cli; node:child_process + hand validation.
- Shells pass child env to `createExecStage({env})`; core never reads process.env.
- Vitest `-t` uses leaf test titles.
- pytest/jest paths untested against real projects (parsers have samples only).
- Nothing from P8b/P8c is committed yet (working tree dirty).

## Next
- Commit P8b/P8c work.
- P9 web: Prisma+Memory store, API routes, `/verify` SSE, `/r/[id]`, `/c/[chainId]`, `/agents` scorecard (min 10 claims, caption "self-reported runs, not a model benchmark"), landing, `/docs`, tests 10-11. Read NOCAP_BUILD.md §7.1, §15, §10.2.
- Then P10 docs + release.
