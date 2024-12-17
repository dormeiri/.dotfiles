vim.defer_fn(function()
	if vim.fn.argv(0) == "" then
		vim.cmd("Telescope project")
	end
end, 0)
