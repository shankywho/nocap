# HANDOFF (after P4, uncommitted)

## Done
- P0-P3 committed. P4 code written, typecheck/lint/tests green (136 tests).
- `runners/types.ts` (TestRunResult) — shared with P5.
- `verifiers/`: fileSet, scope, count, symbol, dependency, dataDriven (tests_pass/added, bug_fixed, refactor, build from ctx), index (`verifyClaim`, `undisclosedChanges`).
- `tamper/`: rules.ts (11 advisory rules), countIntegrity.ts.
- `policy/`: overall.ts (+`totals`), repair.ts (templates, packet, markdown).
- `render/`: terminal (NO_COLOR default), markdown, json. Exported from `src/index.ts`.
- Tests: `test/staticVerifiers.test.ts`, `test/tamperPolicyRender.test.ts`.

## Open for P4 "done when"
- `--no-exec` goldens for all 8 scenarios need `pipeline.ts` (not written yet): extract -> map scope -> verifyClaim -> tamper -> undisclosed -> overall -> Receipt. Golden compare normalises ids/timestamps/ms.
- No `test/__golden__/` yet.

## Notes
- Exec-backed verifiers read `ctx.suite/bitechecks/commands`; with `execEnabled=false` they return unverifiable (never verified).
- tamper flags attach to tests_pass claim else globalFlags: done in pipeline, not in rules.
- Repair text is set on verdict.repair by pipeline via `repairText`.

## Next
Commit P4, then write pipeline (static) + goldens, then P5 (runners, Bitecheck).
