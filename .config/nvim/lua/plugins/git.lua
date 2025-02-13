return {
	{
		-- I use it only for git URL copy
		"f-person/git-blame.nvim",
		event = "VeryLazy",
		opts = {
			-- Uncomment if there are performance issues
			-- schedule_event = "CursorHold",
			-- clear_event = "CursorHoldI",
			display_virtual_text = 0,
		},
	},

	{
		"lewis6991/gitsigns.nvim",
		opts = {},
	},

	{
		"isakbm/gitgraph.nvim",
		dependencies = { "sindrets/diffview.nvim" },
		opts = {
			hooks = {
				on_select_commit = function(commit)
					vim.notify("DiffviewOpen " .. commit.hash .. "^!")
					vim.cmd(":DiffviewOpen " .. commit.hash .. "^!")
				end,
				on_select_range_commit = function(from, to)
					vim.notify("DiffviewOpen " .. from.hash .. "~1.." .. to.hash)
					vim.cmd(":DiffviewOpen " .. from.hash .. "~1.." .. to.hash)
				end,
			},
		},
	},

	{
		"NeogitOrg/neogit",
		dependencies = {
			"nvim-lua/plenary.nvim",
			"sindrets/diffview.nvim",
			"nvim-telescope/telescope.nvim",
		},
		config = true,
	},

	{
		"paopaol/telescope-git-diffs.nvim",
		dependencies = {
			"nvim-lua/plenary.nvim",
			"sindrets/diffview.nvim",
		},
	},

	{
		"comatory/gh-co.nvim",
	},
}
