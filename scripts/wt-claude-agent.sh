#!/usr/bin/env bash
set -euo pipefail

# Runs claude (Claude Code CLI) with a prompt file.
# Run from inside the worktree.

USE_PR=false
AI_MODEL="claude-sonnet-4-6"
USE_HARD=false
MODEL_EXPLICIT=false
DRY_RUN=false
PROMPTFILE=""

usage() {
    echo "Usage: wt-claude-agent [options]"
    echo ""
    echo "Run from inside a worktree. Runs Claude Code CLI with a prompt."
    echo ""
    echo "Options:"
    echo "  --pr              Create a PR after agent runs"
    echo "  --hard            Use claude-opus-4-7 (mutually exclusive with --model)"
    echo "  --model <model>   Claude model (default: claude-sonnet-4-6)"
    echo "  --prompt <file>   Prompt file (skips editor)"
    echo "  --dry-run         Print actions without executing"
    echo "  --help            Show this help message"
}

run() {
    if $DRY_RUN; then
        echo "  [dry-run] $*"
    else
        "$@"
    fi
}

while [[ $# -gt 0 ]]; do
    case "$1" in
        --pr)          USE_PR=true ;;
        --plan)        echo "⚠️  --plan not supported for claude agent, ignoring." ;;
        --easy)        echo "⚠️  --easy not supported for claude agent, ignoring." ;;
        --dry-run)     DRY_RUN=true ;;
        --hard)        USE_HARD=true ;;
        --model)       AI_MODEL="$2"; MODEL_EXPLICIT=true; shift ;;
        --prompt)      PROMPTFILE="$2"; shift ;;
        --help|-h)     usage; exit 0 ;;
        *)
            echo "❌  Unknown option: $1"
            usage
            exit 1
            ;;
    esac
    shift
done

if $USE_HARD && $MODEL_EXPLICIT; then
    echo "❌  --hard and --model are mutually exclusive."
    usage
    exit 1
fi

if $USE_HARD; then
    AI_MODEL="claude-opus-4-7"
fi

if [[ -z "$PROMPTFILE" ]]; then
    PROMPTFILE=".prompt.txt"
    echo "✏️  Opening ${EDITOR:-nvim} for your prompt…"
    if ! $DRY_RUN; then
        ${EDITOR:-nvim} "$PROMPTFILE"
        if [[ ! -f "$PROMPTFILE" || ! -s "$PROMPTFILE" ]]; then
            echo "⚠️  Prompt file is empty or missing — skipping claude agent."
            exit 0
        fi
    fi
fi

if [[ ! -f "$PROMPTFILE" || ! -s "$PROMPTFILE" ]]; then
    echo "⚠️  Prompt file '$PROMPTFILE' is empty or missing — skipping claude agent."
    exit 0
fi

echo ""
echo "🤖 Running claude (model: $AI_MODEL)..."
run claude --model "$AI_MODEL" -p "$(cat "$PROMPTFILE")"

if $USE_PR; then
    echo "📬 Creating PR…"
    run claude --model "$AI_MODEL" -p "Create a PR for the changes in this worktree"
fi
