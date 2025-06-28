return {
	{
		"github/copilot.vim",
		event = "VeryLazy",
	},

	{
		"ravitemer/mcphub.nvim",
		dependencies = {
			"nvim-lua/plenary.nvim",
		},
		build = "npm install -g mcp-hub@latest",
		config = function()
			require("mcphub").setup()
		end,
	},

	{
		"olimorris/codecompanion.nvim",
		opts = function()
			return {
				extensions = {
					mcphub = {
						callback = "mcphub.extensions.codecompanion",
						opts = {
							make_vars = true,
							make_slash_commands = true,
							show_result_in_chat = true,
						},
					},
					history = {
						enabled = true,
						opts = {
							keymap = "<LocalLeader>h",
							auto_save = true,
							expiration_days = 0,
							picker = "telescope",
							picker_keymaps = {
								rename = { n = "r", i = "<M-r>" },
								delete = { n = "d", i = "<M-d>" },
								duplicate = { n = "<C-y>", i = "<C-y>" },
							},
							auto_generate_title = true,
							title_generation_opts = {
								adapter = nil, -- "copilot"
								model = nil, -- "gpt-4o"
								refresh_every_n_prompts = 0,
								max_refreshes = 3,
							},
							continue_last_chat = false,
							delete_on_clearing_chat = false,
							dir_to_save = vim.fn.stdpath("data") .. "/codecompanion-history",
							enable_logging = false,
							chat_filter = nil,
						},
					},
				},
			}
		end,
		dependencies = {
			"nvim-lua/plenary.nvim",
			"nvim-treesitter/nvim-treesitter",
			"ravitemer/mcphub.nvim",
			"ravitemer/codecompanion-history.nvim",
		},
	},
}
