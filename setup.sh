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
first-yolo
