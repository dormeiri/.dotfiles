# Amazon Q pre block. Keep at the top of this file.
[[ -f "${HOME}/Library/Application Support/amazon-q/shell/zprofile.pre.zsh" ]] && builtin source "${HOME}/Library/Application Support/amazon-q/shell/zprofile.pre.zsh"
eval "$(/opt/homebrew/bin/brew shellenv)"

export EDITOR="nvim"

# Shortcuts
alias c="clear"
alias v="nvim"
alias v.="v ."
alias d="docker"
alias awslocal="aws --endpoint-url http://localhost:4566"

# Git
alias git_config_set_personal='git config user.email "dormeiri@gmail.com" && git config user.name "Dor Meiri"'

# zprofile
export PROFILE_PATH="$HOME/.zprofile"
alias zprofile="$EDITOR $PROFILE_PATH"
alias zreload="source $PROFILE_PATH"

# ghostty
alias gprofile="$EDITOR $HOME/.config/ghostty/config"

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
alias sso="aws sso login"
alias kui="open http://localhost:8080"

# Amazon Q post block. Keep at the bottom of this file.
[[ -f "${HOME}/Library/Application Support/amazon-q/shell/zprofile.post.zsh" ]] && builtin source "${HOME}/Library/Application Support/amazon-q/shell/zprofile.post.zsh"
