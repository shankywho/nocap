# Demo script (hard cap 2:00)

| Time | Screen | Voiceover / caption |
|---|---|---|
| 0:00–0:05 | Split: agent says "added tests for retry backoff, didn't touch auth, all 13 tests pass ✅" / receipt shows ✗ toothless, ✗ auth touched | "My agent said it was done. It wasn't." |
| 0:05–0:15 | Highlighted claims on the receipt page | "Agents summarise maybe 1 in 11 things they actually did, and green CI can't tell you if new tests test anything." |
| 0:15–0:25 | `npx @shankywho/nocap check` | "nocap checks every claim against the diff and real test runs." |
| 0:25–0:55 | Live Bitecheck narration: reverting src/retry.ts → tests still pass → TOOTHLESS | "It reverts the fix and re-runs the agent's own tests. If they still pass, they don't test the change." |
| 0:55–1:15 | **Inside Alan, the loop:** the agent calls `verify_claims` → FAIL → `get_repair` → fixes its tests → re-verifies → test report `pass`. Then cut to `/c/<chain>`: "FAIL → PASS in 2 attempts". Show "OpenCode + <open model>" | "Inside Alan it's the verify step: the agent fixes its own claims until the proof holds. And if it cheats by deleting the test, the claim stays open." |
| 1:15–1:30 | **Multi-agent:** two agents in Alan. Backend claims `computeDelay()`; frontend calls `ledger_facts` and gets "CONTRADICTED by backend" before building on it | "With several agents on one task, nobody builds on a teammate's word, only on proven facts." |
| 1:30–1:42 | **Architecture slide (5 s):** summary → open model extracts quoted claims → deterministic verifiers + Bitecheck (git worktree) → receipt → repair packet → agent → re-proof; ledger shared across agents. Then the eval table (CI-only 0/5 vs 5/5, 0 false accusations, gamed repair caught) | "The model only splits the claims. Code decides every verdict. CI catches none of the five problems; this catches all five, and the cheat." |
| 1:42–1:55 | Landing → `npx @shankywho/nocap init --all` → agent tabs → repo | "One command for Claude Code, Codex, Cursor, OpenCode, Gemini and Alan. MIT, open models. Link below." |

Recording notes:
- Pre-record the agent run, and say on screen that it's real.
- Dark theme, 20 px mono font.
- Burned-in captions (X autoplays muted).
- No sped-up footage.
- Keep it under 2 min.
