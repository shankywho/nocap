#!/bin/sh
# Regenerates docs/BUILD_LOG.md from the git log.
cd "$(dirname "$0")/.." || exit 1
{
  echo "# Build log"
  echo
  echo 'Generated from `git log --reverse`. Regenerate with `pnpm build-log`.'
  echo
  echo '| When | Commit |'
  echo '|---|---|'
  git log --reverse --format="| %ad | %s |" --date=format:"%a %H:%M"
} > docs/BUILD_LOG.md
