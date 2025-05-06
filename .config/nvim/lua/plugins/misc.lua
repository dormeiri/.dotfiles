return {
	{
		"folke/which-key.nvim",
		lazy = true,
	},

	{
		"Wansmer/treesj",
		requires = { "nvim-treesitter/nvim-treesitter" },
		event = "VeryLazy",
		opts = {},
	},

	{
		"kylechui/nvim-surround",
		event = "VeryLazy",
		config = function()
			require("nvim-surround").setup({})
		end,
	},

	{
		"MagicDuck/grug-far.nvim",
		event = "VeryLazy",
		opts = {
			transient = true,
			maxSearchMatches = 100,
			debounceMs = 1000,
			minSearchChars = 3,
		},
	},

	{
		"ThePrimeagen/harpoon",
		event = "VeryLazy",
		branch = "harpoon2",
		dependencies = { "nvim-lua/plenary.nvim" },
		config = function()
			local harpoon = require("harpoon")
			harpoon:setup()
		end,
	},
}
