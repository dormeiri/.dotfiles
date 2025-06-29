#!/bin/bash

set -e

/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
brew install zsh git gh
chsh -s $(which zsh)

gh auth login
gh repo clone dormeiri/.dotfiles ~/.dotfiles

touch ~/.credentials

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
    stow \
    yarn \
    sst/tap/opencode

gh extension install dlvhdr/gh-dash
gh extension install gh-copilot

echo "✨ Setup complete! Restart your terminal to apply changes"
