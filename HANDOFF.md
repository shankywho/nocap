# HANDOFF (after 0.1.2 safety pass)

## Latest (safety pass, pushed)
- Builds are opt-in (`--allow-build` / `NOCAP_ALLOW_BUILD=1`); worktree dependency dirs are cloned (APFS/reflink) or, for tests only, a real node_modules of links with state/caches excluded; writable runs need clone/copy else `environment`. Guards for pnpm, npm, yarn (`exec/safeEnv.ts`). `safety.invariant.test.ts` proves the real repo is untouched (runs in CI via `pnpm test`).
- Dogfooding README now uses the agent's ORIGINAL 0.1.1 summary and the live model: 0.1.1 FAIL (1 false ✗, 2 false flags) vs 0.1.2 MIXED (0 ✗). The two sentences once removed ("workspace.ts", "Didn't touch the web app") were never in the original; they are a labelled control (`docs/dogfood/control-two-sentences.md`) and both are ✗ with evidence.
- Tarball `.cache/pack-cli/shankywho-nocap-0.1.2.tgz` re-verified from a fresh repo and from a pnpm-shaped monorepo (default `!`, `--allow-build` ✓ bites, real tree identical).

## Done earlier (all pushed to origin/main; tarball built, NOT published)
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
