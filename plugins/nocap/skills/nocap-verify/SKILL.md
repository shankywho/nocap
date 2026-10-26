---
name: nocap-verify
description: Before declaring a task complete, verify your own summary with nocap and attach the result as the task's test report.
---

# nocap-verify

nocap checks what you claim against what the repository actually shows: the diff, a fresh test run, and a revert-and-retest of your new tests (Bitecheck). Run it on yourself before you say "done".

## Protocol

1. **Start of a multi-agent task:** call `ledger_facts` with the task's keywords. Treat CONTRADICTED and unverified claims from teammates as unknown. Check them with `ledger_check` or `check_scope` before building on them.
2. **While working:** after writing tests, call `bitecheck` on the new test files. If the outcome is `toothless`, the tests pass without your change; add assertions that depend on the new behaviour before claiming they cover anything.
3. **When you believe the task is done:** write your completion summary first.
4. Call `verify_claims` with that summary, the repo path and the task's base branch. Pass your agent name, and your role on multi-agent tasks.
5. **If the result is `fail`:** call `get_repair`, fix the items, and call `verify_claims` again. At most 2 repair loops.
6. **Persist the result** as the task's test report with `mcp__alan__create_test_report`:
   - `status`: `pass`, `fail` or `mixed` — copy it from the `status` field of the JSON block that `verify_claims` returns.
   - `title`: `nocap: <PASS|FAIL|MIXED>`; `summary`: the receipt markdown (the first text block).
   - `steps`: one per claim (name = the quoted claim, status pass/fail/skip, notes = the reason).
   - `issues`: one per contradicted claim (severity `high`, description = the reason and the repair instruction).
   - Use `ALAN_TASK_ID` / `ALAN_SESSION_ID` as `taskId` / `conversationId` when set.
   - Include the proof chain (attempt list with outcomes), not only the last receipt.
   - If that tool is not available, post the receipt markdown as your final message instead.
7. In your final message, include the receipt headline. Never claim verification you did not run.

## Rules when repairing

- Never delete, skip or weaken tests to resolve an item.
- If a claim was wrong and you will not fix it, write `Retracted: <original quote>` in your next summary.
- Restate every original claim you still stand behind in your next summary.

nocap detects dropped claims and weakened tests; doing either shows up as `dropped_silently` or `repair_by_weakening` in the proof chain.
