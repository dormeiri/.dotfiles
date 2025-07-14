export ZSH="$HOME/.oh-my-zsh"
ZSH_THEME="robbyrussell"

plugins=(
    git
    yarn
    gh
    nvm
    npm
    zsh-autosuggestions
    zsh-syntax-highlighting
    fzf-tab
)


source $ZSH/oh-my-zsh.sh

source <(fzf --zsh)
eval "$(zoxide init zsh)"

autoload -U compinit; compinit
