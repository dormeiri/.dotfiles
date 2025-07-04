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

-- Auto save
vim.api.nvim_create_autocmd({ "BufLeave", "FocusLost", "VimLeavePre" }, {
	group = create_augroup("autosave"),
	callback = function(event)
		if
			event.buftype
			or event.file == ""
			or not vim.api.nvim_get_option_value("modified", { buf = event.buf })
			or vim.api.nvim_get_option_value("filetype", { buf = event.buf }) == "harpoon"
		then
			return
		end

		vim.schedule(function()
			vim.api.nvim_buf_call(event.buf, function()
				vim.cmd("silent! write")
			end)
		end)
	end,
})

-- Copy path to clipboard
vim.api.nvim_create_user_command("CopyFullPath", "call setreg('+', expand('%:p'))", {})
vim.api.nvim_create_user_command("CopyRelativePath", "call setreg('+', expand('%'))", {})
vim.api.nvim_create_user_command("CopyCwd", "call setreg('+', getcwd())", {})
