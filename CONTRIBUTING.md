# Contributing

```bash
pnpm i
pnpm lint && pnpm typecheck && pnpm test
```

- `MOCK_EXTERNALS=true` is the default for tests; no network and no keys.
- Keep `packages/core` pure: no `process.env`, filesystem, git or network access outside `adapters/`.
- Verdicts are set by code, never by the model. Contradictions require hard evidence.
- Never modify the user's working tree, index or branches; all execution happens in a temporary worktree and it is removed in `finally`.
- Conventional commits, one logical change at a time.
