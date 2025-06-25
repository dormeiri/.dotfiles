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
brew install ghostty fd ripgrep git gh nvm neovim pyenv tmux fzf yazi stow
npm install -g yarn concurrently wait-on
```

3. Login to GitHub CLI

```bash
gh auth login
```

4. Clone this repo

```bash
gh repo clone dormeiri/.dotfiles ~/.dotfiles
```

5. Stow it

```bash
cd ~/.dotfiles
stow .
```
