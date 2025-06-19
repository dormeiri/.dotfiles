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
		build = "npm install -g mcp-hub@latest", -- Installs `mcp-hub` node binary globally
		config = function()
			require("mcphub").setup()
		end,
	},
	{
		"olimorris/codecompanion.nvim",
		opts = function()
			return {
				extensions = {
					vectorcode = {
						opts = { add_tool = true, add_slash_command = true, tool_opts = {} },
					},
					mcphub = {
						callback = "mcphub.extensions.codecompanion",
						opts = {
							make_vars = true,
							make_slash_commands = true,
							show_result_in_chat = true,
						},
					},
				},
			}
		end,
		dependencies = {
			"nvim-lua/plenary.nvim",
			"nvim-treesitter/nvim-treesitter",
			"ravitemer/mcphub.nvim",
		},
	},
	{
		"Davidyz/VectorCode",
		version = "*",
		build = "uv tool upgrade vectorcode",
		dependencies = { "nvim-lua/plenary.nvim" },
	},
}
