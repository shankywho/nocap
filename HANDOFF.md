# HANDOFF (after P10)

## Done
- P0-P10 complete. 264 tests green + 4 Playwright tests (`pnpm e2e`), lint + typecheck clean, `pnpm -r build` ok, `pnpm eval` ok (B3 5/5, 0 false accusations, repair table, handoff yes/0).
- P9 web (mock mode, no keys): receipts, proof chains, `/agents`, `/verify` SSE, PR mode (`static/prVerify.ts`), demo + loop demo streams, OG cards, landing, `/docs`. `pnpm examples:generate`, `pnpm docs:cli`.
- P10: README (§15.1 order), docs/{ARCHITECTURE,BITECHECK,PRIOR_ART,DEMO_SCRIPT,LAUNCH,BUILD_LOG}.md, CHANGELOG. `pnpm pack:cli` builds a self-contained tarball; `npx nocap demo toothless` verified from an installed tarball. `pnpm build-log` regenerates BUILD_LOG.
- Fixed: fixtures selfcheck test now uses a private cache dir (it raced other tests on `.cache/fixtures`).
- Tagged v0.1.0 (local only; not pushed).

## Human TODO (marked `TODO(human)` in README)
- Record `docs/media/hero.gif`; deployed URL; demo video link; dogfooding paragraph; edit the thought-process draft.
- Verify prior-art descriptions in docs/PRIOR_ART.md against each project; per-agent `init --all` config shapes are unverified (DECISIONS.md).
- Added after v0.1.0: leakage tests (`packages/core/test/leakage.test.ts`, `apps/web/test/leakage.test.ts`), `hook codex|gemini`, GitHub Action (`action/`, `pnpm build:action`), Playwright (`e2e/`), PrismaStore (fake-client tested only; no real DB run).
- Not built: hosted Bitecheck (P12, needs Vercel Sandbox credentials). Codex/Gemini hook payloads and `action.yml` `node24` unverified. Lighthouse not measured. Landing footer lacks the "built for OpenFire by @handle" line.
- Push, CI run, deploy, publish the npm package.
