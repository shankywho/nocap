# Bitecheck

Bitecheck answers one question about a claim like "added tests for the retry backoff": do those tests fail when the change they cover is removed? Tests that still pass without the change do not test it.

## Algorithm (`packages/core/src/bitecheck/run.ts`)

1. **Classify files.** Split the diff into test files and source files. Source means not test, config, lock or docs.
2. **Select claim-bound tests** (`select.ts`). Candidates are only tests the agent added or changed: a title missing from the base version of its file, or a line range overlapping a `+` hunk. Untouched older tests are never candidates, so base tests cannot be reported as toothless. Each candidate scores +3 when its file path is named in the claim, +2 per claim keyword in the file path, +1 per keyword in the title. Score ≥ 2 is selected. With no match, every test in added test files whose path contains a keyword is used. With none of those, the outcome is `no_matching_tests`.
3. **Nothing to revert.** If the diff has no source files, the outcome is `environment` ("the change only touched tests").
4. **Temp worktree.** `git worktree add --detach <tmp>/cp-<runId> <headSha>`, with `node_modules` (and `.venv`) symlinked in. The user's checkout, index and branches are never touched.
5. **Head run.** Run the selected test files (with the runner's title filter when it has one). A selected test that fails gives `broken_on_head`. A runner error with no parsable results gives `environment`.
6. **Revert.** In the worktree only: `git checkout <baseSha> -- <source files that existed at base>`, then delete source files added by the change. Test files stay at head.
7. **Re-run** the same selection and classify:

| Re-run | Outcome |
|---|---|
| all selected tests fail | `bites` |
| some fail, some pass | `bites`, the reason lists the toothless ones |
| all pass | `toothless` |
| every test fails with an import or module-resolution error | `import_only` (counts as ✓ with a "weak" note) |
| nothing parsable | `environment` |

8. **Cleanup.** `git worktree remove --force` and `git worktree prune` in `finally`. A test asserts no worktree is left behind, including when the runner command does not exist.
9. **Timeouts.** Each run is capped by `NOCAP_TEST_TIMEOUT_MS` (default 120000). A timeout is `environment`, never ✗.

## Verdict mapping

| Outcome | `tests_added` | `bug_fixed` |
|---|---|---|
| `bites` | ✓ | ✓ |
| `import_only` | ✓ (weak: fails only at import) | ! |
| `toothless` | ✗ | ! |
| `broken_on_head` | ✗ | ✗ |
| `no_matching_tests` | ✗ only if no test file changed at all | ! |
| `environment` | ! | ! |

## Limits

- Reverts per file, not per hunk. A file with two unrelated changes is reverted whole.
- Needs a detectable runner (Vitest, Jest, pytest). Other runners need `--test-cmd`.
- Monorepos with nested `node_modules` may need the symlink fallback to be adjusted.
