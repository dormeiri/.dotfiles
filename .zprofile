eval "$(/opt/homebrew/bin/brew shellenv)"

export EDITOR="nvim"

# Shortcuts
alias c="clear"
alias v="nvim"
alias v.="v ."
alias d="docker"
alias awslocal="aws --endpoint-url http://localhost:4566"

# fzf
alias fgb="gb | fzf --preview 'git show --color=always {-1}' --bind 'enter:become(git checkout {-1})'"

fpr() {
    if [ $1 = '--help' ]; then
        echo "Usage: fpr [author]"
        echo "List PRs for the given author, or for the current user if no author is provided"
        echo "Use the following key bindings:"
        echo "  - Enter: checkout the selected PR"
        echo "  - CTRL-O: open the selected PR in the browser"
        echo "  - CTRL-Y: copy the URL of the selected PR to the clipboard"
        return
    fi

    local BIND_ENTER='enter:become(echo {} | awk -F" " "{print \$NF}" | xargs git checkout)'
    local BIND_CTRL_O='ctrl-o:become(echo {} | cut -d" " -f1 | xargs gh pr view -w)'
    local BIND_CTRL_Y='ctrl-y:become(echo {} | cut -d" " -f1 | xargs gh pr view --json url --template "{{ .url }}" | pbcopy)'

    gh pr list --author ${1:-@me} \
        --json number,title,updatedAt,headRefName --template '{{range .}}{{tablerow (printf "#%v" .number | autocolor "green") .title (timeago .updatedAt) .headRefName}}{{end}}' \
        | fzf \
        --bind "$BIND_ENTER,$BIND_CTRL_O,$BIND_CTRL_Y" \
        --preview 'echo {} | cut -d" " -f1  | xargs gh pr view' \
        --header "Enter to checkout, CTRL-O to open, CTRL-Y to copy URL"
}

fgwt() {
    local RESULT=$(git worktree list | fzf | cut -d" " -f1)
    if [ -z "$RESULT" ]; then
        return
    fi
    cd $RESULT
}

# Git
alias git_config_set_personal='git config user.email "dormeiri@gmail.com" && git config user.name "Dor Meiri"'
alias grbii='git fetch origin $(git_main_branch) && git rebase -i `git merge-base HEAD origin/$(git_main_branch)`'

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

# Go
export GO_PATH=~/go
export PATH=$PATH:/$GO_PATH/bin

# Port
export PORT_LABS_DIR="$HOME/dev/port-labs"
alias port-labs="cd $PORT_LABS_DIR"

export AWS_PROFILE="port-admin"
alias sso="aws sso login"

alias kui="open http://localhost:8080"

alias port-start="concurrently yarn:admin:start:dev yarn:backend:start:dev yarn:action:start:dev yarn:integration:start:dev yarn:checklist:start:dev"

port-rebuild() {
    if [ -e package.json ]; then
        echo "Cleaning project: $(pwd)"
    else
        echo "No package.json found in $(pwd)"
        return
    fi

    read -q "ans?Are you sure? [y/N] "
    if [[ $ans == "y" ]]; then
        rm -rf **/node_modules **/dist **/build **/coverage
        rm **/tsconfig.tsbuildinfo
        yarn install
        yarn pkg:build
    fi
}
