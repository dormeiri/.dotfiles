vim.g.mapleader = " "
vim.loader.enable()

-- Hooks for plugin build steps (must be defined before vim.pack.add)
vim.api.nvim_create_autocmd("PackChanged", {
	callback = function(ev)
		local name = ev.data.spec.name
		local kind = ev.data.kind
		if name == "nvim-treesitter" and (kind == "install" or kind == "update") then
			if not ev.data.active then
				vim.cmd.packadd("nvim-treesitter")
			end
			vim.cmd("TSUpdate")
		end
		if name == "fff.nvim" and kind == "install" then
			if not ev.data.active then
				vim.cmd.packadd("fff.nvim")
			end
			require("fff.download").download_or_build_binary()
		end
	end,
})

vim.pack.add({
	-- Theme
	"https://github.com/catppuccin/nvim",

	-- Completion
	{ src = "https://github.com/saghen/blink.cmp", version = vim.version.range("1.x") },
	"https://github.com/rafamadriz/friendly-snippets",

	-- LSP
	"https://github.com/neovim/nvim-lspconfig",
	"https://github.com/williamboman/mason.nvim",

	-- Formatting & Linting
	"https://github.com/stevearc/conform.nvim",
	"https://github.com/mfussenegger/nvim-lint",

	-- Treesitter
	"https://github.com/nvim-treesitter/nvim-treesitter",
	"https://github.com/nvim-treesitter/nvim-treesitter-context",

	-- UI
	"https://github.com/nvim-tree/nvim-web-devicons",
	"https://github.com/stevearc/dressing.nvim",
	"https://github.com/folke/noice.nvim",
	"https://github.com/MunifTanjim/nui.nvim",
	"https://github.com/rcarriga/nvim-notify",
	"https://github.com/nvim-lualine/lualine.nvim",
	"https://github.com/yavorski/lualine-macro-recording.nvim",
	"https://github.com/b0o/incline.nvim",
	"https://github.com/lukas-reineke/indent-blankline.nvim",
	"https://github.com/MeanderingProgrammer/render-markdown.nvim",
	"https://github.com/RRethy/vim-illuminate",
	"https://github.com/folke/todo-comments.nvim",
	"https://github.com/folke/trouble.nvim",
	"https://github.com/brenoprata10/nvim-highlight-colors",

	-- Navigation
	"https://github.com/dmtrKovalenko/fff.nvim",
	"https://github.com/nvim-mini/mini.files",
	"https://github.com/nvim-telescope/telescope.nvim",
	"https://github.com/mistweaverco/bafa.nvim",
	{ src = "https://github.com/ThePrimeagen/harpoon", version = "harpoon2" },

	-- Editing
	"https://github.com/folke/which-key.nvim",
	"https://github.com/Wansmer/treesj",
	"https://github.com/kylechui/nvim-surround",
	"https://github.com/MagicDuck/grug-far.nvim",
	"https://github.com/echasnovski/mini.align",

	-- Git
	"https://github.com/f-person/git-blame.nvim",
	"https://github.com/lewis6991/gitsigns.nvim",
	"https://github.com/isakbm/gitgraph.nvim",
	"https://github.com/sindrets/diffview.nvim",
	"https://github.com/NeogitOrg/neogit",

	-- AI
	"https://github.com/github/copilot.vim",

	-- Dependencies
	"https://github.com/nvim-lua/plenary.nvim",
})

require("config.set")
require("config.lsp")
require("config.plugins")
require("config.remap")
