#!/usr/bin/env bash
set -euo pipefail

# Opens nvim to write a prompt, then runs cursor-agent.
# Run from inside the worktree.

USE_PLAN=false
USE_PR=false
AI_MODEL="claude-sonnet-4-6"
USE_HARD=false
USE_EASY=false
MODEL_EXPLICIT=false
DRY_RUN=false
PROMPTFILE=""

usage() {
    echo "Usage: wt-agent [options]"
    echo ""
    echo "Run from inside a worktree. Opens nvim for prompt, then runs cursor-agent."
    echo ""
    echo "Options:"
    echo "  --plan            Run cursor-agent in plan mode"
    echo "  --pr              Create a PR after cursor-agent runs"
    echo "  --hard            Use claude-opus-4-7 (mutually exclusive with --easy/--model)"
    echo "  --easy            Use composer-2 (mutually exclusive with --hard/--model)"
    echo "  --model <model>   cursor-agent model (default: claude-sonnet-4-6)"
    echo "  --prompt <file>   Use existing prompt file instead of opening nvim"
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
        --plan)        USE_PLAN=true ;;
        --pr)          USE_PR=true ;;
        --no-install)  ;; # silently ignore (wt-setup concern)
        --dry-run)     DRY_RUN=true ;;
        --hard)        USE_HARD=true ;;
        --easy)        USE_EASY=true ;;
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

_model_flags=0
$USE_HARD       && (( _model_flags++ )) || true
$USE_EASY       && (( _model_flags++ )) || true
$MODEL_EXPLICIT && (( _model_flags++ )) || true
if (( _model_flags > 1 )); then
    echo "❌  --hard, --easy, and --model are mutually exclusive."
    usage
    exit 1
fi

if $USE_HARD; then
    AI_MODEL="claude-opus-4-7"
elif $USE_EASY; then
    AI_MODEL="composer-2"
fi

if [[ -z "$PROMPTFILE" ]]; then
    PROMPTFILE=".prompt.txt"
    echo "✏️  Opening $EDITOR for your prompt…"
    run $EDITOR "$PROMPTFILE"

    if [[ ! $DRY_RUN && ( ! -f "$PROMPTFILE" || ! -s "$PROMPTFILE" ) ]]; then
        echo "⚠️  Prompt file is empty or missing — skipping cursor-agent."
        exit 0
    fi
fi

if [[ ! -f "$PROMPTFILE" || ! -s "$PROMPTFILE" ]]; then
    echo "⚠️  Prompt file '$PROMPTFILE' is empty or missing — skipping cursor-agent."
    exit 0
fi

echo ""
echo "🤖 Running cursor-agent (model: $AI_MODEL)..."

if $USE_PLAN; then
    run cursor-agent --model "$AI_MODEL" --mode=plan -p --force "$(cat "$PROMPTFILE")"
    if $USE_PR; then
        echo "⏭️ Skipping PR creation in plan mode"
    fi
else
    run cursor-agent --model "$AI_MODEL" -p --force "$(cat "$PROMPTFILE")"
    if $USE_PR; then
        echo "📬 Creating PR…"
        run cursor-agent --model "composer-2" -p --force "Create a PR"
    fi
fi
