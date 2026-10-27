# nocap GitHub Action

Runs nocap on a pull request and comments the receipt. The comment is updated on every push, not duplicated.

```yaml
name: nocap
on:
  pull_request:
permissions:
  contents: read
  pull-requests: write
jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - run: npm ci
      - uses: shankywho/nocap/action@v0.1.2
        with:
          agent: copilot
```

- The PR description is the summary unless `summary` is set.
- **Same-repo PRs only.** Fork PRs are skipped: their token is read-only and secrets are unavailable.
- Tests and Bitecheck run on the checkout, so install dependencies first. Set `exec: "false"` for static checks only.
- Without `llm-api-key` the deterministic offline extractor is used and no text leaves the runner.
- The GitHub token is used only to post the comment and is never passed to the verifier or to test runs.
- `fail-on`: `fail` (default), `mixed` or `never`.
- Outputs: `overall`, `receipt-id`.

`action/dist/index.js` is a committed bundle. Rebuild it with `pnpm build:action` after changing `action/src`.
