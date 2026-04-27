#!/usr/bin/env bash
set -euo pipefail

# Creates a git worktree for BRANCH off BASE_BRANCH.
# Progress → stderr. Worktree path → stdout (capture with $(...)).

BRANCH=""
BASE_BRANCH="main"
DRY_RUN=false

usage() {
    echo "Usage: wt-create <branch-name> [options]" >&2
    echo "" >&2
    echo "Options:" >&2
    echo "  --base <branch>   Base branch to reset from (default: main)" >&2
    echo "  --dry-run         Print actions without executing" >&2
    echo "  --help            Show this help message" >&2
    echo "" >&2
    echo "Outputs worktree path to stdout." >&2
}

run() {
    if $DRY_RUN; then
        echo "  [dry-run] $*" >&2
    else
        "$@"
    fi
}

if [[ $# -eq 0 ]]; then
    usage
    exit 1
fi

BRANCH="$1"
shift

while [[ $# -gt 0 ]]; do
    case "$1" in
        --base)     BASE_BRANCH="$2"; shift ;;
        --dry-run)  DRY_RUN=true ;;
        --help|-h)  usage; exit 0 ;;
        *)
            echo "❌  Unknown option: $1" >&2
            usage
            exit 1
            ;;
    esac
    shift
done

if [[ -z "$BRANCH" ]]; then
    echo "❌  Branch name is required." >&2
    usage
    exit 1
fi

if ! git rev-parse --is-inside-work-tree &>/dev/null; then
    echo "❌  Not inside a git repository." >&2
    exit 1
fi

if git show-ref --quiet --verify "refs/heads/$BRANCH"; then
    echo "❌  Branch '$BRANCH' already exists locally. Choose a different name." >&2
    exit 1
fi

REPO_NAME="${PWD##*/}"
WT_DIR="$HOME/dev/worktrees/${REPO_NAME}/${BRANCH}"

echo "🌿 Creating worktree" >&2
echo "   Repo    : $REPO_NAME" >&2
echo "   Branch  : $BRANCH" >&2
echo "   Base    : origin/$BASE_BRANCH" >&2
echo "   Path    : $WT_DIR" >&2
$DRY_RUN && echo "   ⚠️  Dry-run mode — no changes will be made" >&2
echo "" >&2

run git worktree add "$WT_DIR" || {
    echo "❌  git worktree add failed. Does the worktree already exist?" >&2
    exit 1
}

cd "$WT_DIR" || {
    echo "❌  Could not cd into $WT_DIR" >&2
    exit 1
}

echo "🔄 Fetching origin/$BASE_BRANCH..." >&2
run git fetch origin "$BASE_BRANCH" || {
    echo "❌  git fetch failed." >&2
    exit 1
}
run git reset --hard "origin/$BASE_BRANCH"

if git show-ref --quiet --verify "refs/heads/$BRANCH"; then
    run git checkout "$BRANCH"
else
    run git checkout -b "$BRANCH"
fi
echo "✅ On branch: $BRANCH" >&2

echo "$WT_DIR"
