## What changed and why

## How it was tested

- [ ] `pnpm lint && pnpm typecheck && pnpm test` pass
- [ ] `pnpm eval` still gives B3 5/5 and 0 false accusations (if verifiers or extraction changed)
- [ ] New behaviour has a test

## Checklist

- [ ] Verdicts are still set by code, not by the model, and a ✗ rests on hard evidence
- [ ] Nothing writes to the user's repo, working tree, index or branches
- [ ] Docs and `CHANGELOG.md` updated if behaviour changed
- [ ] Commits follow Conventional Commits
