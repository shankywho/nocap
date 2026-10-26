# HANDOFF (after P6)

## Done
- P0-P4 + P5. 164 tests green, lint/typecheck clean.
- P4: verifiers, tamper, policy, repair, renderers, static `verify()` pipeline, `--no-exec` goldens (`test/__golden__/*.noexec.json`, UPDATE_GOLDEN=1 regenerates).
- P5: `runners/` (detect, run, parseJest incl. Vitest, parseJunit, types), `bitecheck/` (select, run), `exec/stage.ts` (`createExecStage`, allow-listed build commands, shared head worktree, `dispose`).
- `test/pipeline.exec.test.ts`: all 8 scenarios match expected.json with real git + Vitest (toothless -> toothless, honest -> bites, untracked -> import_only), no leftover worktrees, runner-missing case.

- P6 CLI (`apps/cli`): `check` (all §10.1 flags except chain/since-last), `demo`, `repair`, `publish`; exit codes 0/1/2/3; saves `.nocap/receipts/<id>.{json,md}` + `.git/info/exclude`; spinner/--verbose on stderr. `test/check.test.ts` covers integration test 9.
- Terminal renderer now follows §1.4 layout (goldens `*.terminal.txt`, `*.md`).
- `pnpm demo` root script points at scripts/demo.ts (not written); `nocap demo` works via build-fixtures.

## Notes
- CLI could not add deps offline (pnpm store mismatch): no zod/execa in apps/cli; uses node:child_process and hand validation.
- Shells pass child env to `createExecStage({env})`; core never reads process.env.
- Vitest `-t` filter uses leaf test titles (full names did not match).
- Chain fields in receipts are first-attempt stubs (real chain store is P8b).
- Unverifiable verdicts do not carry the bitecheck field (display only; could attach).
- pytest/jest paths untested against real projects (parsers have samples only).

## Next
P7 eval: scripts/eval.ts (B0-B3 baselines, eval/results.md, exit 0 only with B3 5/5 and 0 false accusations), scripts/demo.ts. Read NOCAP_BUILD.md §12.4 first.
