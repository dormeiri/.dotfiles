export ZSH="$HOME/.oh-my-zsh"

export ZSH_THEME="robbyrussell"

plugins=(
    git
    yarn
    npm
    fzf-tab
)

source $ZSH/oh-my-zsh.sh

export NVM_DIR="$([ -z "${XDG_CONFIG_HOME-}" ] && printf %s "${HOME}/.nvm" || printf %s "${XDG_CONFIG_HOME}/nvm")"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

eval "$(zoxide init zsh)"

source $(brew --prefix)/share/zsh-autosuggestions/zsh-autosuggestions.zsh

source $(brew --prefix)/opt/zsh-vi-mode/share/zsh-vi-mode/zsh-vi-mode.plugin.zsh
ZVM_VI_INSERT_ESCAPE_BINDKEY=jk

autoload -U compinit; compinit -i

function zvm_after_init() {
  bindkey "^R" fzf-history-widget
  bindkey "^I" fzf-completion
}

source <(fzf --zsh)

export PATH="$HOME/.local/bin:$PATH"

eval "$(op completion zsh)"; compdef _op op

