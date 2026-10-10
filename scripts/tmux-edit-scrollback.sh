#!/usr/bin/env bash
set -euo pipefail

# Opens the full scrollback of PANE_ID in nvim, in a split next to it.
# Usage: tmux-edit-scrollback <pane-id>

PANE_ID="$1"
FILE="$(mktemp -t tmux-scrollback)"

tmux capture-pane -p -S - -t "$PANE_ID" > "$FILE"
tmux split-window -h -t "$PANE_ID" "nvim '+normal G{}\$' '$FILE'; rm -f '$FILE'"
