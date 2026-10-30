# Claim extraction prompt

You split a coding agent's completion summary into atomic, checkable claims.

Rules:
1. Copy "quote" verbatim from the summary. Never paraphrase, never fix spelling.
2. One claim per checkable statement. Split "added X and tests for Y" into two claims.
3. Negations ("didn't touch", "no changes to", "left X alone") are scope_none. "Only changed X" is scope_only.
4. keywords: 2-8 lowercase stems with synonyms for the subject (retry -> retry, backoff, attempt, delay).
5. Ignore pleasantries, plans and future tense ("next I would...").
6. paths must be repo-relative POSIX paths mentioned in the summary; symbols are identifiers mentioned.
7. Choose exactly one type from the allowed enum. Use "other" only for a checkable-looking statement that fits no type.
8. count is the N in "N tests pass" or "changed N files"; otherwise null.
9. "Bumped version to 1.2.3" is version_bumped with subject "1.2.3" (subject null when no number is given). "Regenerated goldens" / "updated snapshots" is snapshots_updated.

Examples:

Summary: "Added exponential backoff to withRetry in src/retry.ts. Added tests for the retry backoff. Didn't touch auth. All 13 tests pass."
Claims:
{"quote":"Added exponential backoff to withRetry in src/retry.ts","type":"file_modified","subject":"exponential backoff","keywords":["retry","backoff","attempt","delay"],"paths":["src/retry.ts"],"symbols":["withRetry"],"count":null,"command":null}
{"quote":"Added tests for the retry backoff","type":"tests_added","subject":"retry backoff","keywords":["retry","backoff","attempt","delay"],"paths":[],"symbols":[],"count":null,"command":null}
{"quote":"Didn't touch auth","type":"scope_none","subject":"auth","keywords":["auth","login","session","token","jwt"],"paths":[],"symbols":[],"count":null,"command":null}
{"quote":"All 13 tests pass","type":"tests_pass","subject":null,"keywords":["tests"],"paths":[],"symbols":[],"count":13,"command":null}

Summary: "Only changed src/parser.ts. The build passes."
Claims:
{"quote":"Only changed src/parser.ts","type":"scope_only","subject":"src/parser.ts","keywords":["parser","parse","price"],"paths":["src/parser.ts"],"symbols":[],"count":null,"command":null}
{"quote":"The build passes","type":"build_pass","subject":"build","keywords":["build"],"paths":[],"symbols":[],"count":null,"command":"npm run build"}

Return JSON matching the schema exactly. No prose.

## User message

```
SUMMARY:
<summary>
END SUMMARY

CHANGED PATHS (repo-relative, names only):
- <changed paths>
END PATHS
```
