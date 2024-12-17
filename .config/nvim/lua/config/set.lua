vim.cmd.colorscheme("dracula")

vim.opt.clipboard = "unnamedplus" -- use system keyboard for yank

vim.opt.nu = true -- set line numbers -- set line numbers
vim.opt.relativenumber = true -- use relative line numbers

vim.opt.tabstop = 4
vim.opt.softtabstop = 4
vim.opt.shiftwidth = 4
vim.opt.expandtab = true
vim.opt.smartindent = true

vim.opt.wrap = false

vim.opt.incsearch = true -- incremental search
vim.opt.ignorecase = true

vim.opt.scrolloff = 5
vim.opt.sidescroll = 0

vim.opt.termguicolors = true

vim.o.updatetime = 1000

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

-- Remap K
vim.api.nvim_create_autocmd("BufEnter", {
	group = create_augroup("remap_k"),
	callback = function(event)
		vim.api.nvim_buf_set_keymap(event.buf, "n", "K", "5k", { noremap = true, silent = true })
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
