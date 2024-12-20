eval "$(/opt/homebrew/bin/brew shellenv)"

export EDITOR="nvim"

alias c="clear"

alias v="nvim"
alias v.="v ."

# zprofile
export PROFILE_PATH="$HOME/.zprofile"
alias zprofile="$EDITOR $PROFILE_PATH"
alias zreload="source $PROFILE_PATH"

# wezterm
alias wprofile="$EDITOR $HOME/.wezterm.lua"

# Tmux
alias t="tmux"
alias t8r="tmuxinator"
alias trs="tmux rename-session"
alias ta="tmux attach"
alias ts="tmuxinator start"
alias tl="tmuxinator list"
alias tprofile="$EDITOR $HOME/.tmux.conf"
alias treload="tmux source-file $HOME/.tmux.conf"

# Port
export PORT_LABS_DIR="$HOME/dev/port-labs"
alias port-labs="cd $PORT_LABS_DIR"
export AWS_PROFILE="port-admin"
alias sso="(aws sts get-caller-identity &> /dev/null) || aws sso login"

