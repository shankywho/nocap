# nocap

**your agent says it's done. nocap checks.**

nocap turns a coding agent's completion message into executed proof: it splits the summary into claims, binds each claim to evidence in the diff, and proves test claims by reverting the fix and re-running the agent's own tests (Bitecheck). The result is a receipt: verified, contradicted or unverifiable, each with evidence.

> Full README (quickstart, eval, Alan integration, prior art, limits) lands in P10.

## Development

```bash
pnpm i
pnpm lint && pnpm typecheck && pnpm test
pnpm fixtures
```

`MOCK_EXTERNALS=true` runs every pipeline with no API keys. MIT.
