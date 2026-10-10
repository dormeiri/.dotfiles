#!/usr/bin/env bash
set -euo pipefail

# Commit, squash/reorder against origin/main, and force-push.
# Usage: git-ship [--all]   (--all stages everything first)

trap 'read -rp "❌  Failed, press enter to close "' ERR

if [[ "${1:-}" == "--all" ]]; then
    git add .
fi

git commit
git fetch origin main
git rebase -i "$(git merge-base HEAD origin/main)"
git push --force-with-lease --force-if-includes
