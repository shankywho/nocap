# Contributing

Thanks for helping. Bug reports with a receipt and the summary that produced it are the most useful contribution: a wrong ✗ is the bug that matters most.

By taking part you agree to the [Code of Conduct](CODE_OF_CONDUCT.md). Security problems go through [SECURITY.md](SECURITY.md), not public issues.

## Setup

Requires Node 22 or newer for development (the published package runs on Node 20+) and pnpm.

```bash
git clone https://github.com/shankywho/nocap.git
cd nocap
pnpm install
pnpm -r build
```

## Tests

```bash
pnpm lint && pnpm typecheck && pnpm test   # what CI runs, plus build
pnpm eval                                  # planted-lie eval; must stay 5/5 with 0 false accusations
MOCK_EXTERNALS=true pnpm -C apps/web dev   # the website with no network and no keys
```

- `MOCK_EXTERNALS=true` is the default for tests: no network, no API keys, no model calls. Do not add a test that needs either.
- Run one test file while iterating: `pnpm -C packages/core vitest run test/<file>.test.ts`.
- Fixture scenarios live in `fixtures/scenarios/`. Each is built into a temporary git repo, so tests never touch this checkout.
- `safety.invariant.test.ts` checks that a run leaves the real repository untouched. If it fails, fix the code, not the test.

## Design rules

- Keep `packages/core` pure: no `process.env`, filesystem, git or network access outside `adapters/`.
- Verdicts are set by code, never by the model. A ✗ requires hard evidence; if you are not sure, the verdict is `!`.
- Never modify the user's working tree, index, branches or `node_modules`. Execution happens in a temporary worktree that is removed in `finally`, and anything that writes is opt-in.
- Decisions and trade-offs are logged in [docs/decisions.md](docs/decisions.md). Add an entry when you make one.

## Commits and pull requests

- [Conventional Commits](https://www.conventionalcommits.org/): `feat(core): ...`, `fix(cli): ...`, `docs: ...`, `test: ...`, `chore: ...`. One logical change per commit.
- Add or update a test with every fix, and a `CHANGELOG.md` line for user-visible changes.
- Open the pull request against `main` and fill in the template. CI must be green.
