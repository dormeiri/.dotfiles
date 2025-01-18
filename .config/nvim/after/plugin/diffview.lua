-- TODO: Fix this
vim.defer_fn(function()
	-- Diffview colorscheme
	local colors = require("onedarkpro.helpers").get_colors()
	vim.api.nvim_set_hl(0, "DiffChange", { fg = colors.git_change, bg = nil })
	vim.api.nvim_set_hl(0, "DiffDelete", { fg = colors.git_delete, bg = nil })
	vim.api.nvim_set_hl(0, "DiffAdd", { fg = colors.git_add, bg = nil })
end, 0)
