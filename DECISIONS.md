# Decisions

Format: `## <date time> · P<n> · <title>` with context, decision, alternatives and what was verified.
Anything that could not be confirmed against the source is marked **UNVERIFIED** and repeated in `RUN_SUMMARY.md`.

## 2026-10-26 · P0 · Scope cuts for the 25-hour window

- Context: the build started late (Mon 18:55 IST), leaving roughly 25 hours. The full spec is a 31-hour build with three stretch phases.
- Decision: build P0–P10 only. Permanently cut P11 (Codex/Gemini hooks), P12 (hosted Bitecheck), P13 (GitHub Action), the `/agents` web page (the CLI `scorecard` command stays), pytest support (Jest + Vitest only; any other runner via `--test-cmd`), and PR-mode `/verify` (the curated `/api/demo` and example receipts stay).
- Alternatives: dropping the web entirely, which would lose the landing page, receipt page and chain page that judges score; cutting Bitecheck instead, which is explicitly forbidden.
- Verified: NOCAP_BUILD.md §16 cut order. Never-cut list stays intact: Bitecheck, repair loop + proof chain + anti-gaming, MCP tools, eval, Alan plugin, landing + receipt + chain pages.

## 2026-10-26 · P0 · Package manager, TypeScript and tool versions

- Context: TypeScript 7.0 and ESLint 10 are current, but the spec pins TypeScript 5.x and most plugins still advertise 5.x support.
- Decision: TypeScript 5.9.3, ESLint 9.39 flat config, Vitest 5, zod 4 (`z.toJSONSchema`), Next.js 16.4, React 19.3, Tailwind 4, pnpm 11 workspaces.
- Alternatives: TypeScript 7 (Go port) and ESLint 10; both add compatibility risk for zero product value.
- Verified: `npm view` registry metadata, 2026-10-26.

## 2026-10-26 · P0 · §3.1 LLM contract (Groq OpenAI-compatible)

- Context: the engine's only model call is `/chat/completions` with a strict JSON schema, primary Groq, fallback OpenRouter, then a deterministic extractor.
- Decision: plain `fetch` against `{LLM_BASE_URL}/chat/completions`, strict `json_schema` with every property in `required` and `additionalProperties: false`. Send `reasoning_effort: "low"`; if the provider rejects it with 400, retry once without it and record the downgrade in `trace`. Timeout 20 s, one retry on 429/5xx after 1.5 s, then fallback, then offline extraction. `model.degraded = true` whenever the regex path answers.
- Alternatives: a vendor SDK (rejected: lock-in), or streaming (not needed; output is small JSON).
- Verified: https://console.groq.com/docs/structured-outputs — `response_format.json_schema` with `strict: true`, and the "all fields required + additionalProperties:false" rules match. `reasoning_effort` is **not documented on that page**; the adapter treats a 400 as a signal to drop it. Model id `openai/gpt-oss-120b` remains **UNVERIFIED** until a key is supplied; `MOCK_EXTERNALS=true` never calls it.

## 2026-10-26 · P0 · §3.2 GitHub REST contract

- Context: PR mode (web) reads PR metadata, changed files, CI state and the repo tree; it never executes repo code.
- Decision: five endpoints behind `GithubPort` with a 10 s timeout, 1 retry, and a `GithubCache` keyed by `{owner}/{repo}#{n}@{headSha}:{endpoint}`. Missing `patch` means unknown, never "unchanged".
- Alternatives: GraphQL (more per-query complexity for no benefit here).
- Verified: live unauthenticated request to `GET /repos/vercel/next.js/pulls?state=closed&per_page=1` and `/pulls/100703/files?per_page=2` on 2026-10-26: `base.sha`, `head.sha`, and file `filename`, `status`, `additions`, `deletions`, `previous_filename` all match https://docs.github.com/en/rest. Rate-limit behaviour (60/h unauthenticated) is documented, not exercised.

## 2026-10-26 · P0 · §3.3 Claude Code Stop hook contract

- Context: `nocap hook claude` must read the agent's final message from stdin and optionally block the stop with repair instructions.
- Decision: read `last_assistant_message` first, fall back to the JSONL at `transcript_path`, fall back to the session counter in `.nocap/hook-state.json`. Print `{"decision":"block","reason":"…"}` only when `NOCAP_BLOCK=1`, overall is FAIL, `stop_hook_active` is not true, and this session has been blocked fewer than 2 times.
- Alternatives: always blocking (rejected: the spec and safety section require report-only by default).
- Verified: https://code.claude.com/docs/en/hooks — Stop input includes `session_id`, `transcript_path`, `cwd`, `hook_event_name`, `stop_hook_active`, `last_assistant_message`; "Stop decision control" documents `decision: "block"` with a required `reason` and the 8-continuation cap. The settings shape `{"hooks":{"Stop":[{"hooks":[{"type":"command","command":"…"}]}]}}` matches the hooks documentation examples.

## 2026-10-26 · P0 · §3.4 Alan plugin and test-report artifact (verified first, per spec)

- Context: the Alan integration is the highest-value, least-documented contract.
- Decision: the skill persists verification with **`mcp__alan__create_test_report`** and maps `overall` → status: PASS → `pass`, FAIL → `fail`, MIXED → `mixed`. The receipt markdown is passed as the report `summary`; each claim becomes a `step` (name = quote, status pass/fail/skip, notes = reason + evidence), each contradicted claim becomes an `issue` with severity `high`, plus `taskId`/`conversationId`/`teamId` from `ALAN_TASK_ID`/`ALAN_SESSION_ID`/team env when present. The plugin follows the real marketplace layout below.
- Alternatives: posting markdown as the final message only (fallback if the tool is unavailable, as §3.4 requires).
- Verified:
  - https://github.com/tryalan-ai/alan-skills/blob/main/skills/alan-test-feature/SKILL.md — exact tool name `mcp__alan__create_test_report`; parameters `title`, `taskId`, `conversationId`, `teamId`, `branch`, `baseBranch`, `commits[{sha,message}]`, `changedFiles[{path,description}]`, `appUrl`, `summary`, `status: pass|fail|mixed`, `steps[{name,status,screenshotUrl?,notes}]`, `issues[{title,severity,description,screenshotUrl?}]`, `videoUrl?`, `screenshotUrls?`. Artifact link form is `/teams/<teamId>/docs?artifactId=<artifactId>`.
  - https://github.com/tryalan-ai/plugins — 208 plugins; every one uses `.cursor-plugin/plugin.json` + `mcp.json`. Manifest fields verified on `plugins/docs-research` (the one plugin that ships a skill): `name`, `displayName`, `version`, `description`, `author{name}`, `homepage`, `repository`, `license`, `category`, `keywords`, `logo`, `"mcpServers": "./mcp.json"`, `"skills": "./skills/"`. Skills live at `skills/<skill-name>/SKILL.md` with `name` + `description` frontmatter. `mcp.json` is `{ "mcpServers": { "<name>": { … } } }`; marketplace examples are remote HTTP servers. **UNVERIFIED:** whether Alan's gateway accepts a local stdio `command`/`args` server in a marketplace plugin. The plugin ships `command: "npx", args: ["-y","nocap","mcp"]` (Cursor's documented local shape) and `docs/ALAN.md` gives the remote/`Add custom connector` fallback.

## 2026-10-26 · P0 · §3.5 Test runners

- Context: verdicts must come from file reporters, never stdout scraping.
- Decision: Vitest and Jest only. Vitest: `vitest run <files> --reporter=json --outputFile=<tmp>/r.json`. Jest: `jest <files> --json --outputFile=<r.json> --passWithNoTests=false`. Both parse into `TestRunResult`. pytest is cut from scope (logged above); other runners are supported only through `--test-cmd` + `--test-format jest|junit`.
- Alternatives: keeping pytest best-effort; the 25-hour window makes it a net negative and the spec allows cutting it.
- Verified: https://jestjs.io/docs/cli confirms `--json`, `--outputFile=<filename>` and `--passWithNoTests`. Vitest's JSON reporter is exercised against the installed binary in P5 and its real output is committed under `packages/core/test/samples/`; until then it is **UNVERIFIED** only in the sense that no key/internet is involved.

## 2026-10-26 · P0 · §3.6 npm package name

- Context: the CLI must be installable with `npx nocap`.
- Decision: publish as `nocap` (bin `nocap`).
- Alternatives: `nocap-cli` with a `nocap` bin, then `bitecheck`, per the cut order.
- Verified: `npm view nocap` → E404 "Not found" on 2026-10-26, so the name is free.

## 2026-10-26 · P0 · UI stack: Tailwind without the shadcn generator

- Context: the spec asks for shadcn/ui. The landing page is a small, bespoke dark dev-tool page; generating a component library adds install churn and unused code.
- Decision: Tailwind 4 plus hand-written components in `apps/web/components`, following shadcn's token and `cn()` conventions. No Radix dependency unless a real interactive primitive needs it.
- Alternatives: running `shadcn init` and importing a dozen components we would restyle anyway.
- Verified: not applicable (design decision).

## 2026-10-26 · P0 · In-memory store is the default, Postgres is optional

- Context: `MOCK_EXTERNALS=true` must work with zero keys, and the demo never depends on Neon being reachable.
- Decision: `MemoryStore` implements `ReceiptStore` and is used whenever `DATABASE_URL` is empty (and always under mock mode in tests). Prisma is generated only when a database URL exists; the health route reports `db: "memory"` otherwise.
- Alternatives: SQLite (extra native dependency, and the spec says Postgres via Prisma).
- Verified: spec §2/§7.1, not an external contract.
## 2026-10-26 · P1 · Fixtures are real git repos with deterministic SHAs

- Context: goldens compare receipt JSON, which embeds base/head SHAs and file lists. Fixtures must materialise identically on every machine and in CI.
- Decision: each scenario is built by `scripts/build-fixtures.ts` into `.cache/fixtures/<name>` from the shared base project; author/committer identity and dates are fixed (`2026-10-26T13:00+05:30`), `.gitattributes`-style normalisation is not needed (autocrlf and filemode are forced off). Scenario repos symlink the workspace `node_modules`, so their suite runs against the same Vitest binary without a second install. Expected counts are asserted in `fixtures.selfcheck.test.ts`: 12/13/13/13/10/13/13/12 with one skip in `tampered`.
- Alternatives: copying `node_modules` per fixture (slow, non-deterministic mtimes) or using a single repo with branches (harder to keep working-tree modes).
- Verified: `pnpm fixtures` builds eight repos with stable SHAs across two runs; every head suite is green and matches the expected counts.

## 2026-10-26 · P1 · Test-runner output is always a file, never stdout

- Context: Vitest 5's `--reporter=json` writes `output.json` and prints only a human line to stdout; scraping stdout was fragile and colour-dependent.
- Decision: every runner invocation writes to an explicit `--outputFile`; the engine reads and parses that file. Fixture self-checks follow the same rule and read `.cache/fixtures/<name>.head.json`.
- Alternatives: parsing the dot reporter's stdout (rejected: ANSI, locale and version churn).
- Verified: Vitest 5.0.5 behaviour observed locally on 2026-10-26; Jest's `--outputFile` is documented at https://jestjs.io/docs/cli.

## 2026-10-26 · P2 · Read-only git commands must not touch the user's index

- Context: the working-tree invariant (§9.3) requires that status, stash, HEAD, branches and the index file are byte-identical after a run. `git status` and `git diff` refresh the index's stat cache and rewrite `.git/index` unless optional locks are off.
- Decision: every git invocation goes through `SimpleGitPort`, which sets `GIT_OPTIONAL_LOCKS=0` by default and explicitly allows `GIT_INDEX_FILE` through simple-git's environment guard (simple-git 4 strips `GIT_*` variables otherwise). The snapshot uses a throwaway index file, so `git add -A` never stages into the user's index.
- Alternatives: copying the index aside and restoring it (racy, and it would still clobber concurrent user work); accepting an index rewrite (breaks the stated invariant).
- Verified: `git.resolve.test.ts` asserts the index mtime is unchanged across a snapshot run; simple-git 4's `allowEnvironment` option is documented in `dist/src/lib/types/index.d.ts`.

## 2026-10-26 · P2 · Base ref selection falls back to the parent commit

- Context: in a repository whose only branch is the current one (a fresh clone or a fixture repo), `merge-base(HEAD, main)` resolves to HEAD and the diff would be empty.
- Decision: after resolving the default base, if it equals HEAD the engine uses `HEAD~1`. An explicit `--base` is never overridden.
- Alternatives: requiring every caller to pass `--base` (the CLI must work with zero flags); comparing against the empty tree (would report every file as new).
- Verified: `git.fixture.test.ts` shows the committed `honest` scenario diffing to exactly `src/retry.ts` and `test/retry.test.ts`.
