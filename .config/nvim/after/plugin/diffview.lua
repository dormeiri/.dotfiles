vim.defer_fn(function()
	-- Diffview colorscheme
	local color = require("onedarkpro.helpers")
	local colors = color.get_colors()
	vim.api.nvim_set_hl(0, "DiffText", { bg = color.darken(colors.git_hunk_change_inline, 5) })
	vim.api.nvim_set_hl(0, "DiffChange", { bg = "NONE", fg = "NONE" })
	vim.api.nvim_set_hl(0, "DiffDelete", { bg = color.darken(colors.git_hunk_delete_inline, 15) })
	vim.api.nvim_set_hl(0, "DiffAdd", { bg = color.darken(colors.git_hunk_add_inline, 15) })
end, 0)
