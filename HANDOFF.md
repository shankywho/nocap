# HANDOFF (after P4, uncommitted)

## Done
- P0-P3 committed. P4 code written, typecheck/lint/tests green (136 tests).
- `runners/types.ts` (TestRunResult) — shared with P5.
- `verifiers/`: fileSet, scope, count, symbol, dependency, dataDriven (tests_pass/added, bug_fixed, refactor, build from ctx), index (`verifyClaim`, `undisclosedChanges`).
- `tamper/`: rules.ts (11 advisory rules), countIntegrity.ts.
- `policy/`: overall.ts (+`totals`), repair.ts (templates, packet, markdown).
- `render/`: terminal (NO_COLOR default), markdown, json. Exported from `src/index.ts`.
- Tests: `test/staticVerifiers.test.ts`, `test/tamperPolicyRender.test.ts`.

## P4 pipeline
- `src/pipeline.ts` `verify()` static pipeline; optional `ExecStage` (runSuite/bitecheck/runCommand) is the P5 plug-in point.
- `test/pipeline.noexec.test.ts` + `test/__golden__/<scenario>.noexec.json` (UPDATE_GOLDEN=1 to regenerate). All 8 pass.
- Chain fields are first-attempt stubs (real chain store is P8b).

## Notes
- Exec-backed verifiers read `ctx.suite/bitechecks/commands`; with `execEnabled=false` they return unverifiable (never verified).
- tamper flags attach to tests_pass claim else globalFlags: done in pipeline, not in rules.
- Repair text is set on verdict.repair by pipeline via `repairText`.

## Next
P5: runners (detect/vitest/jest/pytest/parse), suite run, build_pass, bitecheck select/run, implement ExecStage.
