# HANDOFF (after P5, committed)

## Done
- P0-P4 + P5. 164 tests green, lint/typecheck clean.
- P4: verifiers, tamper, policy, repair, renderers, static `verify()` pipeline, `--no-exec` goldens (`test/__golden__/*.noexec.json`, UPDATE_GOLDEN=1 regenerates).
- P5: `runners/` (detect, run, parseJest incl. Vitest, parseJunit, types), `bitecheck/` (select, run), `exec/stage.ts` (`createExecStage`, allow-listed build commands, shared head worktree, `dispose`).
- `test/pipeline.exec.test.ts`: all 8 scenarios match expected.json with real git + Vitest (toothless -> toothless, honest -> bites, untracked -> import_only), no leftover worktrees, runner-missing case.

## Notes
- Shells pass child env to `createExecStage({env})`; core never reads process.env.
- Vitest `-t` filter uses leaf test titles (full names did not match).
- Chain fields in receipts are first-attempt stubs (real chain store is P8b).
- Unverifiable verdicts do not carry the bitecheck field (display only; could attach).
- pytest/jest paths untested against real projects (parsers have samples only).

## Next
P6 CLI (apps/cli): `check`, `demo`, `repair`, `publish`; exit codes 0/1/2/3 (integration test 9); saved receipts; `--verbose`. Then P7 eval.
