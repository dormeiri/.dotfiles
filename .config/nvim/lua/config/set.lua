vim.cmd.colorscheme("catppuccin")

vim.opt.clipboard = "unnamedplus" -- use system keyboard for yank

vim.opt.nu = true
vim.opt.relativenumber = true

vim.opt.tabstop = 4
vim.opt.softtabstop = 4
vim.opt.shiftwidth = 4
vim.opt.expandtab = true
vim.opt.smartindent = true
vim.g.editorconfig = false

vim.opt.wrap = false

vim.opt.incsearch = true
vim.opt.ignorecase = true

vim.opt.scrolloff = 5
vim.opt.sidescroll = 0

vim.opt.termguicolors = true

vim.o.updatetime = 10

--------------------
-- Automcommands --
--------------------

local function create_augroup(name)
	return vim.api.nvim_create_augroup("dormeiri:" .. name, {})
end

-- Highlight yanked text
vim.api.nvim_create_autocmd("TextYankPost", {
	group = create_augroup("text_yank_post"),
	callback = function()
		vim.highlight.on_yank({ timeout = 700 })
	end,
})

-- Copy path to clipboard
vim.api.nvim_create_user_command("CopyFullPath", "call setreg('+', expand('%:p'))", {})
vim.api.nvim_create_user_command("CopyRelativePath", function(opts)
	local path = vim.fn.expand("%")
	if opts.range > 0 then
		local line1 = opts.line1
		local line2 = opts.line2
		if line1 == line2 then
			path = path .. ":" .. line1
		else
			path = path .. ":" .. line1 .. "-" .. line2
		end
	end
	vim.fn.setreg("+", path)
	vim.notify(path, vim.log.levels.INFO)
end, { range = true })
vim.api.nvim_create_user_command("CopyCwd", "call setreg('+', getcwd())", {})
