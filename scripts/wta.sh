#!/usr/bin/env bash
set -euo pipefail

# ─── Defaults ────────────────────────────────────────────────────────────────
BRANCH=""
BASE_BRANCH="main"
USE_AI=false
USE_PLAN=false
USE_PR=false
DRY_RUN=false
NO_INSTALL=false
AI_MODEL="opus-4.5-thinking"
PROMPTFILE=""

# ─── Usage ───────────────────────────────────────────────────────────────────
usage() {
    echo "Usage: wta <branch-name> [options]"
    echo ""
    echo "Options:"
    echo "  --ai              Open nvim to write a prompt, then run cursor-agent"
    echo "  --plan            Run cursor-agent in plan mode (requires --ai)"
    echo "  --pr              Create a PR after cursor-agent runs (requires --ai)"
    echo "  --base <branch>   Base branch to reset from (default: main)"
    echo "  --model <model>   cursor-agent model (default: opus-4.5-thinking)"
    echo "  --no-install      Skip dependency installation"
    echo "  --dry-run         Print actions without executing them"
    echo "  --help            Show this help message"
    echo ""
    echo "Example:"
    echo "  wta my-feature --ai --plan --pr --base develop"
}

# ─── Dry-run helper ──────────────────────────────────────────────────────────
run() {
    if $DRY_RUN; then
        echo "  [dry-run] $*"
    else
        "$@"
    fi
}

# ─── Argument parsing ────────────────────────────────────────────────────────
if [[ $# -eq 0 ]]; then
    usage
    exit 1
fi

BRANCH="$1"
shift

while [[ $# -gt 0 ]]; do
    case "$1" in
        --ai)          USE_AI=true ;;
        --plan)        USE_PLAN=true ;;
        --pr)          USE_PR=true ;;
        --no-install)  NO_INSTALL=true ;;
        --dry-run)     DRY_RUN=true ;;
        --base)        BASE_BRANCH="$2"; shift ;;
        --model)       AI_MODEL="$2"; shift ;;
        --help|-h)     usage; exit 0 ;;
        *)
            echo "❌  Unknown option: $1"
            usage
            exit 1
            ;;
    esac
    shift
done

# ─── Validate ────────────────────────────────────────────────────────────────
if [[ -z "$BRANCH" ]]; then
    echo "❌  Branch name is required."
    usage
    exit 1
fi

if ! git rev-parse --is-inside-work-tree &>/dev/null; then
    echo "❌  Not inside a git repository."
    exit 1
fi

if git show-ref --verify --quiet "refs/heads/$BRANCH"; then
    echo "❌  Branch '$BRANCH' already exists locally. Choose a different name."
    exit 1
fi

REPO_NAME="${PWD##*/}"
WT_DIR="$HOME/dev/worktrees/${REPO_NAME}/${BRANCH}"

# ─── Preview ─────────────────────────────────────────────────────────────────
echo "🌿 Creating worktree"
echo "   Repo    : $REPO_NAME"
echo "   Branch  : $BRANCH"
echo "   Base    : origin/$BASE_BRANCH"
echo "   Path    : $WT_DIR"
$DRY_RUN && echo "   ⚠️  Dry-run mode — no changes will be made"
echo ""

# ─── Worktree creation ───────────────────────────────────────────────────────
run git worktree add "$WT_DIR" || {
    echo "❌  git worktree add failed. Does the worktree already exist?"
    exit 1
}

# NOTE: cd in a script only affects the script's process, not the calling shell.
# To change the caller's directory too, source this script or use a shell wrapper.
cd "$WT_DIR" || {
    echo "❌  Could not cd into $WT_DIR"
    exit 1
}

echo "📂 Now in: $WT_DIR"

# ─── AI prompt ───────────────────────────────────────────────────────────────
if $USE_AI; then
    PROMPTFILE=".prompt.txt"
    echo "✏️  Opening nvim for your prompt…"
    run nvim "$PROMPTFILE"

    if [[ ! $DRY_RUN && ( ! -f "$PROMPTFILE" || ! -s "$PROMPTFILE" ) ]]; then
        echo "⚠️  Prompt file is empty or missing — skipping cursor-agent."
        PROMPTFILE=""
    fi
fi

# ─── Sync to base branch ─────────────────────────────────────────────────────
echo "🔄 Fetching origin/$BASE_BRANCH..."
run git fetch origin "$BASE_BRANCH" || {
    echo "❌  git fetch failed."
    exit 1
}
run git reset --hard "origin/$BASE_BRANCH"

# ─── Checkout branch ─────────────────────────────────────────────────────────
run git checkout -b "$BRANCH"
echo "✅ On branch: $BRANCH"

# ─── Dependency installation ─────────────────────────────────────────────────
if ! $NO_INSTALL; then
    if [[ -f "yarn.lock" ]]; then
        echo "📦 yarn detected"
        node --version
        run yarn install
        if jq -e '.scripts["pkg:build"]' package.json &>/dev/null; then
            echo "🔨 Running yarn pkg:build…"
            run yarn pkg:build
        fi
    elif [[ -f "pnpm-lock.yaml" ]]; then
        echo "📦 pnpm detected"
        node --version
        run pnpm install
    elif [[ -f "package-lock.json" ]]; then
        echo "📦 npm detected"
        node --version
        run npm install
    fi
else
    echo "⏭️  Skipping dependency installation (--no-install)"
fi

# ─── cursor-agent ────────────────────────────────────────────────────────────
if [[ -n "$PROMPTFILE" && -s "$PROMPTFILE" ]]; then
    echo ""
    echo "🤖 Running cursor-agent (model: $AI_MODEL)..."

    if $USE_PLAN; then
        run cursor-agent --model "$AI_MODEL" --mode=plan -p --force "$(cat "$PROMPTFILE")"
    else
        run cursor-agent --model "$AI_MODEL" -p --force "$(cat "$PROMPTFILE")"
    fi

    if $USE_PR; then
        echo "📬 Creating PR…"
        run cursor-agent --model auto -p --force "Create a PR"
    fi
fi

echo ""
echo "🎉 Done! Worktree ready at: $WT_DIR"
