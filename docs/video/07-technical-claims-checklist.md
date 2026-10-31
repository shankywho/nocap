# nocap — Technical Claims & Evidence Traceability Matrix
**Purpose:** Every statistic, architecture claim, and capability asserted in the video, scripts, and captions is cross-referenced here against actual source files, test fixtures, and benchmark results in the repository.

---

## 1. Quantitative Benchmark Claims

| Video Claim / Statistic | Exact Script Wording | Source File & Location | Verification Evidence |
|---|---|---|---|
| **0/5 lies caught by summary** | *"Trusting the summary caught zero."* | `eval/results.md:L7` | Strategy `B0 trust-summary`: `0/5` caught, `0` false accusations. |
| **0/5 lies caught by standard CI** | *"Standard CI caught zero."* | `eval/results.md:L8` | Strategy `B1 ci-only`: `0/5` caught, `0` false accusations. CI passes because test exit code is 0. |
| **3/5 caught by static rules** | *"nocap static caught 3/5"* | `eval/results.md:L9` | Strategy `B2 nocap --no-exec`: `3/5` caught (tampered, scope violation, denominator). |
| **5/5 caught by full nocap** | *"nocap caught five out of five"* | `eval/results.md:L10` | Strategy `B3 nocap (full)`: `5/5` (100%) caught across all five planted lie fixtures. |
| **Zero false accusations** | *"with zero false accusations"* | `eval/results.md:L7-10`, `eval/results.md:L18-19` | 0 false accusations across honest scenarios (`honest`, `untracked`, `tdd_trap`). |
| **Built solo in 31 hours** | *"Built solo in 31 hours here at Speed of Thought."* | `docs/BUILD_LOG.md:L1-60` | Git log commit history spans the 31-hour sprint from initial repo scaffold to v0.1.0 release tag. |
| **Repair loop resolution** | *"automatically generates a repair packet to force the agent to fix it"* | `eval/results.md:L26-30`, `packages/core/src/loop/repairLoop.ts` | Scripted agent repair loop resolves all 4 actionable planted lies within 2 attempts. |

---

## 2. Core Architectural & Algorithmic Claims

| Architectural Assertion | Exact Script Wording | Code Implementation & Documentation | Verification Evidence |
|---|---|---|---|
| **LLM does not judge truth** | *"We don't use AI to judge AI. The model extracts claims. Code decides truth."* | `docs/ARCHITECTURE.md:L24`<br>`packages/core/src/extract/prompts.ts` | The LLM prompt only produces structured JSON claims and scope tokens. No verdict logic is present in the prompt. |
| **Quote Guard substring verification** | *"a Quote Guard drops any hallucinations"* | `packages/core/src/extract/quoteGuard.ts`<br>`packages/core/test/quoteGuard.test.ts` | Quote Guard strictly scans raw agent text for exact substring match of each extracted claim; discards unquoted paraphrases. |
| **Pure engine invariant (Ports & Adapters)** | *"Pure TypeScript, zero side effects. Dependency-injected ports."* | `packages/core/src/ports.ts`<br>`docs/ARCHITECTURE.md:L3-4` | Core engine never imports `fs`, `git`, or reads `process.env`. All I/O is passed via `ports.ts`. |
| **Isolated detached git worktree** | *"It isolates a throwaway git worktree..."* | `packages/core/src/bitecheck/run.ts:L10`<br>`packages/core/src/git/worktree.ts` | `git worktree add --detach <tmp>/cp-<runId> <headSha>`. User checkout, branches, and working tree are untouched. |
| **Bitecheck source revert** | *"reverts the agent's code, and reruns the tests"* | `packages/core/src/bitecheck/revert.ts`<br>`docs/BITECHECK.md:L14` | In revert mode: `git checkout <baseSha> -- <source files>`, then reruns the selected claim-bound tests. |
| **AST function stubbing (`return undefined`)** | *"ts-morph AST stubs the body to return undefined"* | `packages/core/src/bitecheck/stub.ts`<br>`docs/BITECHECK.md:L13` | When agent adds a new function, deleting it would cause import errors. nocap keeps function signature and replaces body with `return undefined` via ts-morph AST. |
| **Toothless test classification** | *"The tests still pass without the fix. Verdict: Contradicted (toothless)."* | `packages/core/src/bitecheck/run.ts`<br>`docs/BITECHECK.md:L22` | If tests pass after source revert/stub, outcome is `toothless` and maps to `CONTRADICTED` ✗. |
| **Append-only ledger** | *"every verified fact is written to an immutable append-only ledger"* | `packages/core/src/ledger/ledger.ts`<br>`.nocap/ledger.jsonl` | Append-only JSONL format recording run ID, chain ID, parent ID, timestamps, claim hashes, and verdicts. |
| **Tamper detection** | *"AST tamper rules"* | `packages/core/src/tamper/tamper.ts`<br>`fixtures/tampered/` | Scans test diff hunks for deleted assertions, skipped tests (`it.skip`), or weakened matchers. |

---

## 3. CLI Commands & Tooling Compatibility

| CLI Command Asserted | Video Context | Implementation Reference | Run Status |
|---|---|---|---|
| `pnpm demo toothless` | Main terminal demonstration | `scripts/demo.ts`<br>`fixtures/toothless` | Fully functional, executes in ~2.8s |
| `pnpm eval` | Benchmark evaluation screen | `scripts/eval.ts`<br>`eval/results.md` | Fully functional, tests B0–B3 suites |
| `nocap check` | Primary user CLI command | `apps/cli/src/commands/check.ts` | Fully functional |
| `nocap init --all` | Multi-agent configuration setup | `apps/cli/src/commands/init.ts` | Injects `.mcp.json`, `.gemini`, `.claude`, `AGENTS.md` |
| `nocap loop` | Automated repair loop driver | `apps/cli/src/commands/loop.ts` | Fully functional |
| `nocap bitecheck` | Standalone test efficacy command | `apps/cli/src/commands/bitecheck.ts` | Fully functional |

---

## 4. Quality Control & Fact-Checking Sign-Off

- [x] **No Invented Capabilities:** Every single feature mentioned in narration (Diff analysis, AST tamper rules, Quote Guard, Bitecheck revert, AST stubbing, Repair packets, Ledger) exists in `packages/core`.
- [x] **No Simulated Terminal Recordings:** All terminal screen recordings use real scripts (`scripts/demo.ts`, `scripts/eval.ts`) running against the real fixture repository.
- [x] **No Overstated Accuracy Claims:** The 5/5 score is explicitly cited as our **controlled project benchmark** (`eval/results.md`) on planted lies, not a claim of universal automated bug detection.
- [x] **Excalidraw Diagram Validity:** Verified with Excalidraw parser (`docs/media/nocap-architecture.excalidraw`).
- [x] **16:9 1080p Image Export:** Rendered directly to `docs/media/nocap-architecture.png` (1920x1080) with semantic color mapping.
