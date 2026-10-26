# HANDOFF (after P9)

## Done
- P0-P8c complete (see git log). 236 tests; one fixtures selfcheck test is flaky under full-suite load, passes alone.
- P9 web (`apps/web`), all in mock mode, no keys: `src/server/{store,api,run,og}`, routes `/api/{receipts,receipts/[id],examples,chains/[id],scorecard,verify-pr,demo,demo/loop,health}`, `/r/[id]` (+raw, OG), `/c/[chainId]` (+OG), `/agents`, `/verify` (SSE via `src/ui/StreamRun`), landing, `/docs` (CLI help from `pnpm docs:cli`).
- Core: `static/prVerify.ts`, `adapters/{github.mock,github.fetch,web}.ts`, subpath `@nocap/core/adapters/web`. `fixtures/github/` = demo/fixture-shop#7.
- `pnpm examples:generate` writes `examples/ex-{toothless,loop-2,gamed-1,gamed,scope,count}.json` (seeded as examples).
- `next build` passes. Tests: `apps/web/test/{api,demo}.test.ts` (integration 10 equivalent).

## Notes
- No Prisma/Playwright (offline). See DECISIONS.md. Live store = implement `ReceiptStore` with Prisma.
- Landing "built for OpenFire by @handle" footer line and light/dark polish not done. Lighthouse not measured.
- CLI could not add deps offline: no zod/execa in apps/cli.
- Shells pass child env to `createExecStage({env})`; core never reads process.env.

## Next
- P10 docs + release: README (§15.1), docs/*.md (ARCHITECTURE, BITECHECK, PRIOR_ART, DEMO_SCRIPT, LAUNCH), CHANGELOG, CONTRIBUTING, `pnpm -r build`, CLI `npm pack`, then tag v0.1.0. Read NOCAP_BUILD.md §15.1, §15.4, Part B (B4, B5).
