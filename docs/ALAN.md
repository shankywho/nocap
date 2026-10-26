# nocap + Alan

## Install

1. Add the `plugins/nocap` folder to your Alan workspace (or install the `nocap` plugin from the marketplace).
2. The plugin starts the MCP server with `npx -y nocap mcp`. If your Alan setup only accepts remote servers, run `nocap mcp` yourself and add it through *Add custom connector*.
3. Agents pick up the `nocap-verify` skill automatically.

## What the agent calls

| Step | Tool |
|---|---|
| Start of a multi-agent task | `ledger_facts` |
| After writing tests | `bitecheck` |
| Before saying "done" | `verify_claims` |
| After a `fail` | `get_repair`, fix, `verify_claims` again (max 2 loops) |

## Test-report mapping (`mcp__alan__create_test_report`)

| nocap | Alan |
|---|---|
| overall `PASS` / `FAIL` / `MIXED` | `status` `pass` / `fail` / `mixed` |
| receipt markdown | `summary` |
| each claim | a `step` (name = quote, notes = reason) |
| each contradicted claim | an `issue`, severity `high` |
| `ALAN_TASK_ID`, `ALAN_SESSION_ID` | `taskId`, `conversationId`; also stamped into `receipt.input.alan` |

## Status

The tool name and arguments were taken from the public `alan-skills` repository (see DECISIONS.md). Whether Alan's gateway accepts a local stdio MCP server from a marketplace plugin is **unverified**; the remote-connector fallback above covers that case.
