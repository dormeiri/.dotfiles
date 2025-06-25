# .dotfiles

The 127.0.0.1 of my terminal! If you’re reading this, you’re probably either me, a future me, or lost.

```plain
  ____||____
 ///////////\
///////////  \
|    _    |  |
|[] | | []|[]|
|   | |   |  |
```

## What’s in here?

- My Neovim config (because I can't quit vim, and not because I can't `:q`)
- Shell tweaks, aliases, and scripts that make my terminal feel like a second home
- Some random configs that I probably forgot about

## If you are me, or crazy, here is how to set it up

1. Install brew
2. Run this

```bash
brew install zsh ghostty fd ripgrep git gh nvm neovim pyenv tmux fzf yazi stow
npm install -g yarn concurrently wait-on
chsh -s $(which zsh)
gh auth login
gh repo clone dormeiri/.dotfiles ~/.dotfiles
touch ~/.credentials
cd ~/.dotfiles
stow .
```
