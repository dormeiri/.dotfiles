return {
	{
		"folke/which-key.nvim",
		lazy = true,
	},

	{
		"Wansmer/treesj",
		requires = { "nvim-treesitter/nvim-treesitter" },
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
		"smoka7/multicursors.nvim",
		event = "VeryLazy",
		dependencies = {
			"nvimtools/hydra.nvim",
		},
		opts = {},
		cmd = { "MCstart", "MCvisual", "MCclear", "MCpattern", "MCvisualPattern", "MCunderCursor" },
		keys = {
			{
				mode = { "v", "n" },
				"<Leader>m",
				"<cmd>MCstart<cr>",
				desc = "Create a selection for selected text or word under the cursor",
			},
		},
	},

	{
		"MagicDuck/grug-far.nvim",
		opts = {
			transient = true,
			maxSearchMatches = 100,
			debounceMs = 1000,
			minSearchChars = 3,
		},
	},

	{
		"ThePrimeagen/harpoon",
		branch = "harpoon2",
		dependencies = { "nvim-lua/plenary.nvim" },
		config = function()
			local harpoon = require("harpoon")
			harpoon:setup()
		end,
	},

	{
		"yochem/jq-playground.nvim",
		opt = {
			cmd = "jq",
		},
	},
}
