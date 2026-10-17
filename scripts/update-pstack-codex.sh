#!/usr/bin/env bash
# Sync this fork with cursor/plugins, rebuild the Codex pstack tree, publish it to the fork, and reinstall it into Codex.
# Usage: scripts/update-pstack-codex.sh [--resume]
# Exit codes: 0 done, 2 dirty tree, 3 merge conflict outside the generated tree,
# 4 Codex adapter is missing a row, 5 pstack script tests failed, 6 push or install failed.
set -uo pipefail

UPSTREAM_URL="https://github.com/cursor/plugins.git"
MARKETPLACE="pstack-codex"
PLUGIN="pstack@pstack-codex"

cd "$(git rev-parse --show-toplevel)" || exit 1

version() { node -p "require('./pstack/plugin.json').version"; }
merging() { git rev-parse -q --verify MERGE_HEAD >/dev/null; }

if [ "${1:-}" != "--resume" ]; then
  if [ -n "$(git status --porcelain)" ]; then
    echo "STOP dirty: commit or discard these changes first"
    git status --short
    exit 2
  fi
  git remote get-url upstream >/dev/null 2>&1 || git remote add upstream "$UPSTREAM_URL"
  git checkout -q main
  git pull -q --ff-only origin main || { echo "STOP: local main has diverged from origin/main"; exit 6; }
  git rev-parse HEAD > .git/pstack-update-base
  version > .git/pstack-update-version
  git fetch -q upstream main
  echo "upstream commits to merge: $(git rev-list --count HEAD..upstream/main)"
  if [ "$(git rev-list --count HEAD..upstream/main)" -gt 0 ] && ! git merge --no-edit -q upstream/main; then
    other=$(git diff --name-only --diff-filter=U | grep -v '^harness/pstack/' || true)
    if [ -n "$other" ]; then
      echo "STOP conflict: resolve these, then rerun with --resume"
      echo "$other"
      exit 3
    fi
    git checkout --theirs -- harness/pstack && git add harness/pstack
  fi
fi

if ! node scripts/generate-pstack-harness-trees.mjs; then
  echo "STOP adapter: add the missing rows to pstack/docs/harness/codex.md, then rerun with --resume"
  exit 4
fi

if ! (cd pstack/skills/poteto-mode/scripts && bun install --frozen-lockfile >/dev/null 2>&1 && bun test >/dev/null 2>&1); then
  echo "STOP tests: pstack's bundled script tests failed (cd pstack/skills/poteto-mode/scripts && bun test)"
  exit 5
fi

git add -A
if merging; then
  git commit -q --no-edit
elif ! git diff --cached --quiet; then
  git commit -q -m "chore(pstack): regenerate the Codex harness tree"
fi

git push -q origin main || { echo "STOP: push to origin failed"; exit 6; }
codex plugin marketplace upgrade "$MARKETPLACE" >/dev/null || { echo "STOP: marketplace upgrade failed"; exit 6; }
codex plugin add "$PLUGIN" >/dev/null || { echo "STOP: plugin install failed"; exit 6; }

base=$(cat .git/pstack-update-base 2>/dev/null || git rev-parse HEAD)
echo "version: $(cat .git/pstack-update-version 2>/dev/null || version) -> $(version)"
echo "upstream pstack changes:"
git log --no-merges --format='  %h %s' "$base..HEAD" -- pstack cursor-team-kit/skills/deslop cursor-team-kit/skills/control-ui cursor-team-kit/skills/control-cli
echo "installed: $(codex plugin list -m "$MARKETPLACE" | tail -1)"

