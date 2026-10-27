# HANDOFF (after 0.1.2 fixes)

## Done (all pushed to origin/main; tarball built, NOT published)
- Dogfood false accusations fixed: tests_pass runs the detected runner in place when head is the working tree (snapshot or clean HEAD); worktree only for Bitecheck. Resolution/setup failures, <50% collected, or failures that pass in the working tree are `!` (environment), never ✗. One source of truth for totals (`runners/tally.ts`; suite errors count as failed tests).
- Monorepo Bitecheck: per-entry linking of every workspace node_modules (siblings point at the worktree copy), build + rebuild after revert only when the tests reach a package whose dist is missing.
- Tamper flags: `test_config_changed` only on real config files; skip/only/trivial/env rules ignore strings, templates, comments, regex literals (`tamper/mask.ts`).
- New claims: `version_bumped`, `snapshots_updated` (changed goldens attached as evidence). `nocap demo --live`.
- Dogfooding section in README with 0.1.1 vs 0.1.2 receipts (`docs/dogfood/0.1.1-summary.md`).
- INCIDENT (see DECISIONS.md): a `pnpm -r build` in a worktree ran `pnpm install` through the linked node_modules and rewired the user's real node_modules. Repaired by hand; fixed with `pnpm_config_verify_deps_before_run=false` on every child + a warning if `.modules.yaml` changes.
- 353 tests, lint, typecheck clean. Tarball: `.cache/pack-cli/shankywho-nocap-0.1.2.tgz`.

## Notes
- In this sandbox pnpm refuses to run scripts (store mismatch): use `pnpm --config.verify-deps-before-run=false ...` or `node_modules/.bin/*`. Do not run plain `pnpm install` here.
- `npx ./file.tgz` must be relative; absolute paths are executed as commands.
- Not publishing: user runs `cd .cache/pack-cli && npm publish --access public`.
- Bitecheck stubs every added function in the whole change, not only the ones the claimed tests reach (coarse, like the old whole-file revert).
