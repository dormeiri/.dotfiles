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

	-- {
	-- 	"m4xshen/autoclose.nvim",
	-- 	opts = {},
	-- },

	{
		"MagicDuck/grug-far.nvim",
		opts = {},
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
}
