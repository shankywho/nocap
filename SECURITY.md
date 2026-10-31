# Security policy

## Supported versions

Only the latest published release of `@shankywho/nocap` receives security fixes.

## Reporting a vulnerability

Please do not open a public issue for a security problem. Use GitHub's private reporting instead:

1. Go to the [Security tab](https://github.com/shankywho/nocap/security/advisories/new) of this repository.
2. Choose "Report a vulnerability" and describe the problem, the version, and steps to reproduce it.

You can expect an acknowledgement within a few days. This is a solo-maintained project, so fixes are made on a best-effort basis; the report stays private until a fixed release is out.

## What counts

The most important property of nocap is that it never modifies the repository it is checking. These are in scope:

- Anything that makes `check`, `bitecheck`, `loop`, a hook or an MCP tool write to the checked repository, its `node_modules`, its index or its branches.
- Anything that sends file contents, diffs or secrets to a model endpoint or to the receipts API. Only the summary text and file paths are meant to leave the machine.
- Exposure of the stored model key (`nocap config set llm-key`), which is written with mode 600 and never printed.
- Path traversal, command injection or unsafe execution through a summary, a `.nocaprc.json` or a receipt.

Running a repository's own test suite is the point of the tool. A test suite that does something harmful when run is not a nocap vulnerability, but a way around the opt-in `--allow-build` guard is.
