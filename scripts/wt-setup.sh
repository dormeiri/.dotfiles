#!/usr/bin/env bash
set -euo pipefail

# Installs dependencies in the current worktree directory.
# Run from inside the worktree.

DRY_RUN=false

usage() {
    echo "Usage: wt-setup [options]"
    echo ""
    echo "Run from inside a worktree. Detects and installs dependencies."
    echo ""
    echo "Options:"
    echo "  --dry-run   Print actions without executing"
    echo "  --help      Show this help message"
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
        --dry-run)  DRY_RUN=true ;;
        --help|-h)  usage; exit 0 ;;
        *)
            echo "❌  Unknown option: $1"
            usage
            exit 1
            ;;
    esac
    shift
done

if [[ -f "yarn.lock" ]]; then
    echo "📦 yarn detected"
    node --version
    run yarn install
elif [[ -f "pnpm-lock.yaml" ]]; then
    echo "📦 pnpm detected"
    node --version
    run pnpm install
elif [[ -f "package-lock.json" ]]; then
    echo "📦 npm detected"
    node --version
    run npm install
else
    echo "⏭️  No lockfile found — skipping dependency installation"
fi
