eval "$(/opt/homebrew/bin/brew shellenv)"

export EDITOR="nvim"

source $HOME/.credentials
source $HOME/.portfile

yolo() {
    brew update
    brew upgrade
    brew cleanup -s

    gh extension upgrade --all

    npm install -g \
        concurrently@latest \
        wait-on@latest


    nvim --headless "+Lazy! sync" +qa
    nvim --headless \
		+MasonUpdate \
		+TSUpdateSync \
		+UpdateRemotePlugins \
		+'helptags ALL' \
		+qa

    devbox version update

    echo "✨ Done"
}

# Shortcuts

alias c="clear"
alias v="nvim"
alias v.="v ."
alias d="docker"
alias awslocal="aws --endpoint-url http://localhost:4566"
alias ghd="gh dash"
alias dotfiles="cd $HOME/.dotfiles"
alias gprofile="$EDITOR $HOME/.config/ghostty/config"

export PROFILE_PATH="$HOME/.zprofile"
alias zprofile="$EDITOR $PROFILE_PATH"
alias zreload="source $PROFILE_PATH"

# yazi

o() {
	local tmp="$(mktemp -t "yazi-cwd.XXXXXX")" cwd
	yazi "$@" --cwd-file="$tmp"
	if cwd="$(command cat -- "$tmp")" && [ -n "$cwd" ] && [ "$cwd" != "$PWD" ]; then
		builtin cd -- "$cwd"
	fi
	rm -f -- "$tmp"
}

# Git

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

wta() {
    git worktree add $HOME/dev/worktrees/${PWD##*}/$1
}

wtf() {
    local BIND_ENTER='enter:become(echo {} | cut -d" " -f1 | xargs echo)'
    local BIND_CTRL_Y='ctrl-y:become(echo {} | cut -d" " -f1 | xargs echo | pbcopy)'
    local BIND_CTRL_D='ctrl-d:become(echo {} | cut -d" " -f1 | xargs git worktree remove)'

    local RESULT=$(git worktree list | fzf \
        --bind "$BIND_ENTER,$BIND_CTRL_Y,$BIND_CTRL_D" \
        --header "Enter to cd, CTRL-Y to copy path, CTRL-D to remove")

    if [ -n "$RESULT" ]; then
        cd $RESULT
    fi
}

alias git_config_set_personal='git config user.email "dormeiri@gmail.com" && git config user.name "Dor Meiri"'
alias grbii='git fetch origin $(git_main_branch) && git rebase -i `git merge-base HEAD origin/$(git_main_branch)`'
alias grbomm='git fetch origin $(git_main_branch) && git rebase origin/$(git_main_branch)'
alias gbcopy='current_branch | pbcopy'
alias gpwr="git push && sleep 5 && gh pr checks --watch && gh pr ready"
alias gpfwr="git push --force-with-lease --force-if-includes && sleep 8 && gh pr checks --watch && gh pr ready"

# Tmux

alias t="tmux"
alias tprofile="$EDITOR $HOME/.tmux.conf"
alias treload="tmux source-file $HOME/.tmux.conf"

# Docker

docker-cleanup-runtime() {
    docker rm -f $(docker ps -aq)
    docker volume prune
    docker network prune
}

docker-cleanup-images() {
    docker rmi $(docker images -q)
    docker builder prune
}

# Go

export GO_PATH=~/go
export PATH=$PATH:/$GO_PATH/bin

# Opecode

q() {
    if [ -n "$1" ]; then
        opencode run $@
    else
        opencode
    fi
}

alias "?"="q"
