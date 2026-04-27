#!/bin/bash

set -e

/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
brew install zsh git gh stow
chsh -s $(which zsh)

gh auth login
gh repo clone dormeiri/.dotfiles ~/.dotfiles

touch ~/.credentials
touch ~/.hushlogin

cd ~/.dotfiles
stow .

source ~/.zprofile
yolo

brew install \
    ghostty \
    fd \
    ripgrep \
    nvm \
    neovim \
    pyenv \
    tmux \
    fzf \
    yazi \
    yarn \
    gcalcli \
    zoxide \
    zsh-autosuggestions \
    zsh-vi-mode \
    f1bonacc1/tap/process-compose \
    rtk

git clone https://github.com/Aloxaf/fzf-tab ${ZSH_CUSTOM:-~/.oh-my-zsh/custom}/plugins/fzf-tab

gh extension install dlvhdr/gh-dash

curl -fsSL https://get.jetify.com/devbox | bash

echo "👉🏻👉🏻👉🏻👉🏻👉🏻 After you install Cursor/Claude, initialize RTK and Caveman 🗿"

echo "✨ Setup complete! Restart your terminal to apply changes"
