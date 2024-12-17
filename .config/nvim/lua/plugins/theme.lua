return {
	{
		"binhtran432k/dracula.nvim",
		lazy = false,
		priority = 1000,
		opts = {
			on_colors = function(colors)
				local hl = vim.api.nvim_set_hl

				hl(0, "GitGraphHash", { fg = colors.purple })
				hl(0, "GitGraphTimestamp", { fg = colors.yellow })
				hl(0, "GitGraphAuthor", { fg = colors.pink })
				hl(0, "GitGraphBranchName", { fg = colors.cyan })
				hl(0, "GitGraphBranchTag", { fg = colors.green })
				hl(0, "GitGraphBranchMsg", { fg = colors.comment })
				hl(0, "GitGraphBranch1", { fg = colors.pink })
				hl(0, "GitGraphBranch2", { fg = colors.green })
				hl(0, "GitGraphBranch3", { fg = colors.red })
				hl(0, "GitGraphBranch4", { fg = colors.yellow })
				hl(0, "GitGraphBranch5", { fg = colors.cyan })
			end,
		},
	},
}
