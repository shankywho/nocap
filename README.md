# nocap

**your agent says it's done. nocap checks.**

[![CI](https://github.com/shankywho/nocap/actions/workflows/ci.yml/badge.svg)](https://github.com/shankywho/nocap/actions) ![license MIT](https://img.shields.io/badge/license-MIT-blue) ![open models only](https://img.shields.io/badge/models-open%20only-3ee0cf)

nocap turns a coding agent's completion message into executed proof. It splits the summary into claims, binds each claim to evidence in the diff, and proves test claims by reverting the fix and re-running the agent's own tests (Bitecheck). The result is a receipt: each claim is verified, contradicted or unverifiable, with evidence. Contradicted claims go back to the agent as a repair packet until it proves them.

<!-- TODO(human): record docs/media/hero.gif (must contain a ✗) and embed it here:
![nocap catching toothless tests](docs/media/hero.gif) -->

## Try it

- Live demo: **TODO(human): deployed URL** (no signup; an example receipt shows a ✗ within one click)
- Locally: `npx @shankywho/nocap demo`

## Quickstart

```bash
npx @shankywho/nocap demo                              # see it catch toothless tests on a fixture
cd your-repo && pbpaste | npx @shankywho/nocap check   # verify your agent's last summary
npx @shankywho/nocap init --all --write                # wire MCP + hooks into every agent you have
```

`npx @shankywho/nocap demo` builds a small fixture repo in your temp directory and installs `vitest` into it (needs network once); without network it falls back to static checks. `init` is a dry run unless you pass `--write`. `check` exits 0 on pass, 1 on a contradiction, 2 on bad input, 3 on MIXED with `--strict`.

## What it checks

- **Bitecheck:** the tests the agent added must fail when its source change is reverted.
- **Scope:** "didn't touch auth" is mapped to paths and compared with the diff.
- **Test counts:** "42 tests pass" is compared with what the suite collects (the denominator check).
- **Tamper flags:** loosened assertions, skipped tests and deleted tests, attached to the claim they undermine. Advisory.
- **Undisclosed changes:** files that changed but no claim mentions, test and config files first.
- **CI in PR mode:** check runs stand in for the suite when there is no checkout.
- **Alan test reports:** the receipt maps to Alan's `pass` / `fail` / `mixed` report.

## How it works

```mermaid
flowchart LR
  S[summary] --> E[extract claims] --> M[bind to diff] --> P[prove: verifiers + Bitecheck] --> R[receipt] --> Q[repair packet] --> S
```

The open model only splits the summary into claims and maps concepts to paths. Code sets every verdict. A quote guard drops any claim whose quote is not in the summary. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Bitecheck

1. Pick the tests the agent added or changed that match the claim.
2. Run them at head. They must pass.
3. In a throwaway git worktree, revert the source files to base.
4. Re-run the same tests.
5. If they still pass, they do not test the change: `toothless`.

```
✗ CONTRADICTED  "Added tests for the retry backoff in test/retry.test.ts"
                BITECHECK reverted src/retry.ts → 2/2 matching tests STILL PASS
```

Details and limits: [docs/BITECHECK.md](docs/BITECHECK.md).

## Verdict policy

| Claim | ✓ when | ✗ when |
|---|---|---|
| tests_added | Bitecheck `bites` | `toothless`, `broken_on_head`, or no test files changed |
| tests_pass | no failures and the count matches what the suite collects | failures, or a count mismatch |
| scope_none | mapped files do not intersect the diff | a mapped file changed |
| file_created / modified / deleted / renamed | the diff shows it | the diff and head tree contradict it |
| symbol_added | identifier appears in an added line and is declared | identifier absent from changed files |
| refactor_no_behavior_change | no test files changed and the suite passes | tests were edited, or the suite fails |

Anything nocap cannot check is `!`, with the reason. **✗ requires hard evidence; tamper flags are advisory.**

## Eval

Five planted lies and three honest scenarios, run under four strategies. `pnpm eval` regenerates this and exits non-zero if B3 drops below 5/5 or any honest scenario gets a ✗.

```
strategy                 planted lies caught   false accusations
B0 trust-summary         0/5                   0
B1 ci-only               0/5                   0
B2 nocap --no-exec       3/5                   0
B3 nocap (full)          5/5                   0
```

B1 is "run the test suite on head and treat red as caught"; the planted lies all leave it green.

## The repair loop

`nocap loop --agent-cmd "<your agent> {repair_file}"` checks, hands the repair packet to the agent, and re-checks. Attempts form a proof chain (`nocap chain`, `/c/<chainId>` on the web). Anti-gaming rules: a claim dropped without a `Retracted: <quote>` is `dropped_silently`, a deleted test is `repair_by_weakening`, and either fails the chain.

```
repair loop (scripted agent)     attempts   chain outcome
toothless                        2          resolved (fixed: tests now bite)
scope_violation                  2          resolved (fixed: auth change reverted)
denominator                      2          resolved (honest retraction)
fake_refactor                    2          resolved (fixed: assertion restored)
toothless_gamed                  2          UNRESOLVED (test deleted + claim dropped silently) ← caught
```

The eval agent is scripted: it applies each scenario's `repair/` overlay. It shows the loop and the anti-gaming rules work, not that a real model repairs well. **TODO(human): link the demo video of a real OpenCode run.**

## Multi-agent

When several agents share a task, one agent's unproven claim becomes the next one's assumption. nocap records every verdict in `.nocap/ledger.jsonl` with the actor and the git blobs it was true for.

- `nocap handoff [--to <role>]` lists what the next agent can trust, what it must not rely on, and which facts are stale. The MCP tool `ledger_facts` returns the same.
- `check --since-last` judges an agent only on its own delta, so it is not blamed for the previous agent's files.
- `--scope-role backend=src/server/**` declares a scope; touching another role's files adds a `cross_agent_overlap` warning (advisory, never ✗).

Scenario 10: the backend agent claims `computeDelay()` but exports `getDelay()`. Before the frontend agent builds on it, `ledger_facts("computeDelay")` returns "CONTRADICTED by backend". Editing `src/backoff.ts` afterwards makes the earlier verified facts about it stale.

## Works with every agent

`npx @shankywho/nocap init --all` detects agents and writes their config. Dry run by default.

| Agent | What `init --all --write` writes |
|---|---|
| Claude Code | `.claude/settings.json` Stop hook, MCP entry |
| Codex | `[mcp_servers.nocap]` in `config.toml` (with `--user`), `AGENTS.md` block |
| Cursor | MCP entry |
| OpenCode | MCP entry |
| Gemini CLI | MCP entry |
| Alan | `plugins/nocap` |
| All | `AGENTS.md` (and `CLAUDE.md` if present) protocol block between `<!-- nocap:start -->` and `<!-- nocap:end -->` |

The per-agent config shapes are the best-known formats and are **unverified** against each agent's current docs (see DECISIONS.md). Per-agent accuracy is on `/agents` and via `nocap scorecard`, with percentages after 10 claims. Those numbers are self-reported runs, not a model benchmark.

## Using with Alan

1. Add `plugins/nocap` to your Alan workspace. It starts the MCP server with `npx -y @shankywho/nocap mcp`.
2. The agent picks up the `nocap-verify` skill (`plugins/nocap/skills/nocap-verify/SKILL.md`): `ledger_facts` at the start of a multi-agent task, `bitecheck` after writing tests, `verify_claims` before saying done, `get_repair` after a fail.
3. Results map to Alan's test report:

| nocap | Alan |
|---|---|
| `PASS` / `FAIL` / `MIXED` | `pass` / `fail` / `mixed` |
| receipt markdown | summary |
| each claim | a step |
| each contradicted claim | a high-severity issue |

Workflow recipe: run `npx @shankywho/nocap check --md` on every agent PR and paste the markdown into the PR. Whether Alan accepts a local stdio MCP server from a plugin is unverified; [docs/ALAN.md](docs/ALAN.md) has the remote-connector fallback.

## GitHub Action

`action/` comments the receipt on same-repo PRs and updates it on each push. Setup and limits: [docs/ACTION.md](docs/ACTION.md).

## Open models

Claim extraction uses any OpenAI-compatible endpoint, `openai/gpt-oss-120b` on Groq by default. Set `LLM_BASE_URL`, `LLM_API_KEY` and `LLM_MODEL` to swap it. The spec estimates about $0.007 per receipt at that model's list prices; that figure is not measured here. `--offline` (or `NOCAP_OFFLINE=1`) skips the model and uses the deterministic extractor, with the same verifiers.

## What it can't check

- Semantic correctness: it proves tests bite, not that the change is right.
- Behaviour claims that are not tests ("it feels faster").
- Per-hunk reverts: Bitecheck reverts whole files.
- Monorepos with nested `node_modules`.
- Runners other than Vitest, Jest and pytest need `--test-cmd`. The jest and pytest paths are tested against parser samples, not real projects.
- PR mode cannot execute anything: tests_added, bug_fixed and build_pass are `!` there, and `symbol_added` is `!` because there is no checkout.

## Prior art

Several tools check agent claims; none that I know of resolves which tests a given sentence refers to and reverts per claim. The table, with caveats about verification, is in [docs/PRIOR_ART.md](docs/PRIOR_ART.md).

## Dogfooding

nocap checks its own work. The same command is run against the same range with each version, so the difference is the tool.

```bash
git clone https://github.com/shankywho/nocap && cd nocap && pnpm install
# in the repo root, with the published tarball of the version under test:
npx --yes ./nocap-<version>.tgz check --offline --no-hunks \
  --base 92e05bb --head 1a294f9 \
  --summary docs/dogfood/0.1.1-summary.md
```

`docs/dogfood/0.1.1-summary.md` is the summary of the 0.1.1 work, rebuilt from the closing message of that session (the original paste was not saved), with two sentences removed that were wrong about 0.1.1. `--offline` keeps it deterministic. `--head 1a294f9` is not the working tree, so the suite cannot run in place: it runs in a bare checkout, which is where 0.1.1 went wrong.

**Before, 0.1.1:** `FAIL`, three ✗ and two flags, all false.

- ✗ "Added tests for the Bitecheck stub mode…" and ✗ "Added tests for the node --test runner…": "the claimed tests fail on head". They failed only because the worktree had no workspace `node_modules` or built packages.
- ✗ "All 301 tests pass": the report said `61/65 passed` and `36 of 65 tests fail` at the same time (two different counts), because a setup failure was counted as test failures.
- `test config changed` on `hygiene.test.ts:8` (an import path containing "exclude") and `skip added` on `runners.nodeTest.test.ts:49` (a `test.skip(` inside a template literal).

```
NOCAP  receipt 7712f54817  ·  agent: unknown  ·  base 92e05bb → (1a294f9)
──────────────────────────────────────────────────────────────────────────────
! UNVERIFIABLE  "Added `config.ts` in packages/core/src/adapters"
                'config.ts' matches several files: apps/cli/src/commands/config.ts, fixtures/project/src/config.ts, packages/core/src/adapters/config.ts.
! UNVERIFIABLE  "Added tests for the offline banner in apps/cli/test/config.test.ts"
                The Bitecheck could not run in this environment.
✗ CONTRADICTED  "Added tests for the Bitecheck stub mode in packages/core/test/bitecheck.stub.test.ts"
                The claimed tests fail on head.
! UNVERIFIABLE  "Added tests for hygiene in packages/core/test/hygiene.test.ts"
                The Bitecheck could not run in this environment.
✗ CONTRADICTED  "Added tests for the node --test runner in packages/core/test/runners.nodeTest.test.ts"
                The claimed tests fail on head.
✗ CONTRADICTED  "All 301 tests pass"
                61/65 passed · vitest · 9.7s
                36 of 65 tests fail on head.
                ! test config changed  packages/core/test/hygiene.test.ts:8  import { isAlwaysExcluded } from "../src/git/exclude";
                ! skip added  packages/core/test/runners.nodeTest.test.ts:49  put(dir, "test/a.test.js", `import { test, describe } from "node:test";\nimport assert from "node:assert";\ndescribe("math", () => {\n  test("adds", () => assert.equal(1 + 1, 2));\n  test("breaks", () => assert.equal(1, 2));\n  test.skip("later", () => {});\n});\n`);
──────────────────────────────────────────────────────────────────────────────
UNDISCLOSED     packages/core/test/__golden__/denominator.noexec.json  M +1 −1   (changed, never mentioned)
UNDISCLOSED     packages/core/test/__golden__/denominator.terminal.txt  M +1 −1   (changed, never mentioned)
UNDISCLOSED     packages/core/test/__golden__/fake_refactor.noexec.json  M +1 −1   (changed, never mentioned)
UNDISCLOSED     packages/core/test/__golden__/honest.noexec.json  M +1 −1   (changed, never mentioned)
UNDISCLOSED     … (list trimmed here; the full list is in the receipt JSON)
RESULT          FAIL · 0 verified · 3 contradicted · 3 unverifiable · 20.5s · offline
```

**After, 0.1.2:** `MIXED`, no ✗, no false flags, counts consistent.

- Tests that cannot run in a bare checkout are `!` (environment), never ✗. The two tests that only fail there, because they read gitignored fixtures, are reported as depending on uncommitted files.
- `Bumped version to 0.1.1` and `Regenerated goldens` are now checked, with the changed files as evidence, so the goldens no longer show up as UNDISCLOSED.
- Two Bitecheck results are still `!` in this run (the offline banner tests and the `node --test` tests could not be run in the bare checkout). They stay `!` rather than guessing.
- The remaining UNDISCLOSED files are real: the summary does not mention them.

```
NOCAP  receipt 29dfb7c868  ·  agent: unknown  ·  base 92e05bb → (1a294f9)
──────────────────────────────────────────────────────────────────────────────
! UNVERIFIABLE  "Added `config.ts` in packages/core/src/adapters"
                'config.ts' matches several files: apps/cli/src/commands/config.ts, fixtures/project/src/config.ts, packages/core/src/adapters/config.ts.
! UNVERIFIABLE  "Added tests for the offline banner in apps/cli/test/config.test.ts"
                The Bitecheck could not run in this environment.
✓ VERIFIED      "Added tests for the Bitecheck stub mode in packages/core/test/bitecheck.stub.test.ts"
                BITECHECK (stub) stubbed runConfig, configFile, readConfig, writeConfigValue, resolveLlmKey, llmStatus, ensureTs, load, tsFunctions, stubTsBody, pyDefs, stubPython, tsBodies, revertTsFunction, revertPython, mutateForStub, functionNames, addedFunctions, stubFunctions, T, isStubbable, excludePathspecs, isAlwaysExcluded, undisclosedView, parseNodeTestScript, nodeTestArgs, isNodeTestScript, junitReporterMissing, runNodeTests, runFixtureGit() → 10/12 matching tests fail
✓ VERIFIED      "Added tests for hygiene in packages/core/test/hygiene.test.ts"
                BITECHECK (stub) stubbed runConfig, configFile, readConfig, writeConfigValue, resolveLlmKey, llmStatus, ensureTs, load, tsFunctions, stubTsBody, pyDefs, stubPython, tsBodies, revertTsFunction, revertPython, mutateForStub, functionNames, addedFunctions, stubFunctions, T, isStubbable, excludePathspecs, isAlwaysExcluded, undisclosedView, parseNodeTestScript, nodeTestArgs, isNodeTestScript, junitReporterMissing, runNodeTests, runFixtureGit() → 3/5 matching tests fail
! UNVERIFIABLE  "Added tests for the node --test runner in packages/core/test/runners.nodeTest.test.ts"
                The Bitecheck could not run in this environment.
✓ VERIFIED      "Bumped version to 0.1.1"
                apps/cli/package.json  M +1 −1
✓ VERIFIED      "Regenerated goldens"
                fixtures/scenarios/untracked/expected.json  M +1 −1
! UNVERIFIABLE  "All 301 tests pass"
                2 tests fail in a clean checkout of 1a294f9 but pass in your working tree, so they depend on uncommitted files (build output, caches, generated fixtures), not on the code under review
──────────────────────────────────────────────────────────────────────────────
UNDISCLOSED     packages/core/test/fixtures.git-isolation.test.ts  A +69 −0   (changed, never mentioned)
UNDISCLOSED     packages/core/test/regexExtractor.test.ts  M +20 −0   (changed, never mentioned)
UNDISCLOSED     packages/core/test/renderTerminal.test.ts  M +12 −0   (changed, never mentioned)
UNDISCLOSED     packages/core/test/staticVerifiers.test.ts  M +1 −1   (changed, never mentioned)
UNDISCLOSED     … (list trimmed here; the full list is in the receipt JSON)
RESULT          MIXED · 4 verified · 0 contradicted · 4 unverifiable · 190.7s · offline
```

A real failure is still a ✗: `packages/core/test/monorepo.test.ts` has a case where a genuinely failing test in the working tree is reported as contradicted.

## Architecture, API, privacy, development

- Architecture: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).
- API: `POST /api/receipts`, `GET /api/receipts/:id`, `DELETE /api/receipts/:id` (header `x-delete-token`), `GET /r/:id/raw`, `POST /api/verify-pr` and `POST /api/demo` (SSE), `GET /api/chains/:chainId`, `GET /api/scorecard`, `GET /api/health`.
- Privacy: only the summary and file paths go to the model, never file contents. Tests run locally in a throwaway worktree. Published receipts are public by link and deletable with their token. No accounts.
- Development:

```bash
pnpm i
pnpm lint && pnpm typecheck && pnpm test && pnpm eval
MOCK_EXTERNALS=true pnpm -C apps/web dev
```

- License: MIT.

## Thought process

TODO(human): edit this draft into your own voice.

I started from a gap I kept hitting: an agent ends with "added tests, didn't touch auth, all green", and CI being green says nothing about whether the new tests exercise the change. The claims are cheap to make and expensive to check, so people skip checking.

There are already tools that check agent claims, and at least one reverts the source and re-runs added tests. That ruled out "revert and re-run" as the pitch on its own. What I could add was binding the proof to the sentence the agent actually wrote, so each claim gets its own verdict and its own evidence.

The wedge became the loop. A receipt that says ✗ is useful once; a receipt that goes back to the agent, and a chain that records whether the agent fixed the code or just deleted the test, is what makes it a verify step. The anti-gaming rules exist because an agent under pressure takes the cheapest path.

The model never sets a verdict. It splits the summary into claims and maps "auth" to globs, and a quote guard throws away anything not in the summary. Every verdict comes from code reading git and test output, so it is reproducible and can be tested without a model.

Precision over recall: a false accusation costs trust faster than a miss. The eval gate is 0 false accusations on the honest scenarios, and anything uncertain is `!`.

Trade-offs are in [DECISIONS.md](DECISIONS.md). Cut: Prisma store and Playwright (not installable offline here), Codex and Gemini hooks, hosted Bitecheck. Next: a real-agent loop eval, per-hunk revert, more runners.
