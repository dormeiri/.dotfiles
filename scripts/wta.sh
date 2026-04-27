#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

BRANCH=""
BASE_BRANCH="main"
USE_AI=false
USE_PLAN=false
USE_PR=false
DRY_RUN=false
NO_INSTALL=false
AI_MODEL="claude-sonnet-4-6"
USE_HARD=false
USE_EASY=false
MODEL_EXPLICIT=false
SETUP_SCRIPT=""
AGENT="cursor"

usage() {
    echo "Usage: wta <branch-name> [options]"
    echo ""
    echo "Options:"
    echo "  --ai              Open nvim to write a prompt, then run agent
  --agent <type>    Agent to use: cursor (default) or claude"
    echo "  --plan            Run cursor-agent in plan mode (requires --ai)"
    echo "  --pr              Create a PR after cursor-agent runs (requires --ai)"
    echo "  --base <branch>   Base branch to reset from (default: main)"
    echo "  --hard            Use claude-opus-4-7 (mutually exclusive with --easy/--model)"
    echo "  --easy            Use composer-2 (mutually exclusive with --hard/--model)"
    echo "  --model <model>   cursor-agent model (default: claude-sonnet-4-6)"
    echo "  --setup <script>  Custom setup script to run instead of wt-setup.sh
  --no-install      Skip dependency installation"
    echo "  --dry-run         Print actions without executing"
    echo "  --help            Show this help message"
    echo ""
    echo "Example:"
    echo "  wta my-feature --ai --pr --base develop --hard"
}

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
        --hard)        USE_HARD=true ;;
        --easy)        USE_EASY=true ;;
        --setup)       SETUP_SCRIPT="$2"; shift ;;
        --agent)       AGENT="$2"; shift ;;
        --model)       AI_MODEL="$2"; MODEL_EXPLICIT=true; shift ;;
        --help|-h)     usage; exit 0 ;;
        *)
            echo "❌  Unknown option: $1"
            usage
            exit 1
            ;;
    esac
    shift
done

# ─── Create worktree ─────────────────────────────────────────────────────────
CREATE_ARGS=("$BRANCH" "--base" "$BASE_BRANCH")
$DRY_RUN && CREATE_ARGS+=("--dry-run")

WT_DIR=$("$SCRIPT_DIR/wt-create.sh" "${CREATE_ARGS[@]}")

echo "📂 Now in: $WT_DIR"
cd "$WT_DIR"

# ─── Prompt (before setup so editor opens while deps install) ─────────────────
PROMPTFILE=""
if $USE_AI; then
    PROMPTFILE=".prompt.txt"
    echo "✏️  Opening ${EDITOR:-nvim} for your prompt…"
    if ! $DRY_RUN; then
        ${EDITOR:-nvim} "$PROMPTFILE"
        if [[ ! -f "$PROMPTFILE" || ! -s "$PROMPTFILE" ]]; then
            echo "⚠️  Prompt file is empty or missing — skipping agent."
            PROMPTFILE=""
        fi
    fi
fi

# ─── Setup ───────────────────────────────────────────────────────────────────
if [[ -n "$SETUP_SCRIPT" ]]; then
    "$SETUP_SCRIPT"
elif ! $NO_INSTALL; then
    SETUP_ARGS=()
    $DRY_RUN && SETUP_ARGS+=("--dry-run")
    "$SCRIPT_DIR/wt-setup.sh" "${SETUP_ARGS[@]}"
else
    echo "⏭️  Skipping setup (--no-install)"
fi

# ─── Agent ───────────────────────────────────────────────────────────────────
if [[ -n "$PROMPTFILE" ]]; then
    AGENT_ARGS=("--prompt" "$PROMPTFILE")
    $USE_PLAN       && AGENT_ARGS+=("--plan")
    $USE_PR         && AGENT_ARGS+=("--pr")
    $USE_HARD       && AGENT_ARGS+=("--hard")
    $USE_EASY       && AGENT_ARGS+=("--easy")
    $MODEL_EXPLICIT && AGENT_ARGS+=("--model" "$AI_MODEL")
    $DRY_RUN        && AGENT_ARGS+=("--dry-run")

    case "$AGENT" in
        cursor) "$SCRIPT_DIR/wt-cursor-agent.sh" "${AGENT_ARGS[@]}" ;;
        claude) "$SCRIPT_DIR/wt-claude-agent.sh" "${AGENT_ARGS[@]}" ;;
        *)
            echo "❌  Unknown agent: $AGENT (use cursor or claude)"
            exit 1
            ;;
    esac
fi

echo ""
echo "🎉 Done! Worktree ready at: $WT_DIR"
