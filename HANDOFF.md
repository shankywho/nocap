# HANDOFF (after 0.1.1 fixes)

## Done
- Six real-world fixes from running the published 0.1.0 package, one commit each, all pushed to origin/main:
  1. `nocap config set|get llm-key` (file mode 600, key never printed), key order NOCAP_LLM_API_KEY > GROQ_API_KEY > LLM_API_KEY > config file, never-silent offline banner, `· offline` / `· model@provider` in RESULT, regex extractor emits symbol_added + file_modified.
  2. Snapshots and ChangeSets always exclude node_modules, .venv, venv, dist, build, .next, .turbo, coverage, .nocap, .cache, *.log (`git/exclude.ts`); UNDISCLOSED capped at 15 + "…and N more", lockfiles one quiet line.
  3. Bitecheck stub mode (`bitecheck/stub.ts`, ts-morph loaded lazily): added functions are stubbed to `return undefined` / `return None`, modified existing functions go back to base bodies; receipts carry `mode` and `stubbed`. docs/BITECHECK.md updated.
  4. `runFixtureGit` in scripts/build-fixtures.ts: git only strictly inside the cache, GIT_CEILING_DIRECTORIES set, so it can never commit to the main repo. Test: `fixtures.git-isolation.test.ts`.
  5. `node --test` runner (junit reporter, one process per file). Flags verified on Node v24.11.0 only; see DECISIONS.md.
  6. Version 0.1.1, metadata -> github.com/shankywho/nocap, CHANGELOG, goldens regenerated.
- 301 tests, lint and typecheck clean. Tarball: `.cache/pack-cli/shankywho-nocap-0.1.1.tgz` (2.7 MB: ts-morph/TypeScript are bundled). Verified with `npx --yes ./pkg.tgz check` on fresh repos: offline banner, stub toothless (✗) and stub bites (✓).

## Notes
- Not published. Publish: `cd .cache/pack-cli && npm publish --access public`.
- In this sandbox pnpm refuses to run scripts (store mismatch). Use `pnpm --config.verify-deps-before-run=false ...` or `node_modules/.bin/vitest|eslint|tsc`.
- `npx <absolute .tgz>` runs the path as a command; use `npx ./file.tgz` from the cwd or `npx --package=<tgz> nocap`.
- Python stubbing is unit-tested only (no pytest integration). Earliest Node with the junit reporter is unverified.
