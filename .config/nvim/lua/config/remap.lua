local map = vim.keymap.set

-- Harpoon
local harpoon = require("harpoon")
map("n", "<leader>a", function() harpoon:list():add() end, { desc = "Add Harpoon" })
map("n", "<leader>A", function() harpoon.ui:toggle_quick_menu(harpoon:list()) end, { desc = "List Harpoons" })
map("n", "<leader>1", function() harpoon:list():select(1) end, { desc = "Harpoon 1" })
map("n", "<leader>2", function() harpoon:list():select(2) end, { desc = "Harpoon 2" })
map("n", "<leader>3", function() harpoon:list():select(3) end, { desc = "Harpoon 3" })
map("n", "<leader>4", function() harpoon:list():select(4) end, { desc = "Harpoon 4" })
map("n", "<leader>5", function() harpoon:list():select(5) end, { desc = "Harpoon 5" })

-- Navigate
map("n", "ff", function() require("fff").find_files() end, { desc = "FFFind files" })
map("n", "fg", function() require("fff").live_grep() end, { desc = "Live grep" })
map("n", "fc", function() require("fff").live_grep({ query = vim.fn.expand("<cword>") }) end, { desc = "Search current word" })
map("n", "-", function()
	local MiniFiles = require("mini.files")
	local buf_name = vim.api.nvim_buf_get_name(0)
	local path = vim.fn.filereadable(buf_name) == 1 and buf_name or vim.fn.getcwd()
	MiniFiles.open(path)
	MiniFiles.reveal_cwd()
end, { desc = "Open Mini Files" })
map("n", "<leader>b", function() require("bafa.ui").toggle() end, { desc = "Bafa buffer switcher" })

-- Search and replace
map("n", "<leader>f", "<cmd>GrugFar<cr>", { desc = "Search and replace" })
map("v", "<leader>f", function()
	require("grug-far").with_visual_selection({ prefills = { paths = vim.fn.expand("%") } })
end, { desc = "Search and replace with visual selection in the current file" })
map("v", "<leader>F", function()
	require("grug-far").open({ visualSelectionUsage = "operate-within-range" })
end, { desc = "grug-far: Search within range" })
map("n", "<leader>F", function()
	require("grug-far").open({ prefills = { search = vim.fn.expand("<cword>"), paths = vim.fn.expand("%") } })
end, { desc = "Search and replace current word in current file" })

-- Copy path
map("v", "R", function()
	local start_line = vim.fn.line("v")
	local end_line = vim.fn.line(".")
	if start_line > end_line then start_line, end_line = end_line, start_line end
	local result = vim.fn.fnamemodify(vim.fn.expand("%"), ":.") .. ":" .. start_line .. "-" .. end_line
	vim.fn.setreg("+", result)
	print("Copied: " .. result)
end)
map("n", "R", function()
	local result = vim.fn.fnamemodify(vim.fn.expand("%"), ":.")
	vim.fn.setreg("+", result)
	print("Copied: " .. result)
end)

-- Trouble
map("n", "<leader>x", "<cmd>Trouble diagnostics<cr>", { desc = "Diagnostics (Trouble)" })

-- Telescope LSP
map("n", "gr", "<cmd>Telescope lsp_references<cr>", { desc = "References" })
map("n", "gd", "<cmd>Telescope lsp_definitions<cr>", { desc = "Definitions" })
map("n", "gD", "<cmd>Telescope lsp_declaration<cr>", { desc = "Declaration" })
map("n", "gi", "<cmd>Telescope lsp_implementations<cr>", { desc = "Implementations" })
map("n", "go", "<cmd>Telescope lsp_type_definitions<cr>", { desc = "Type definitions" })
map("n", "<leader>s", function()
	require("telescope.builtin").lsp_document_symbols({ symbols = "Function" })
end, { desc = "Document symbols" })

-- LSP
map("n", "gh", "<cmd>lua vim.lsp.buf.hover()<cr>", { desc = "LSP Hover" })
map("n", "<leader>cr", "<cmd>lua vim.lsp.buf.rename()<cr>", { desc = "LSP Rename" })
map("n", "<leader>ca", "<cmd>lua vim.lsp.buf.code_action()<cr>", { desc = "LSP Actions" })

-- Git
map("n", "gs", "<cmd>Neogit<cr>", { desc = "Git status" })
map("n", "<leader>gs", "<cmd>DiffviewOpen<cr>", { desc = "Git diff status" })
map("n", "<leader>gm", "<cmd>DiffviewOpen main...HEAD<cr>", { desc = "Git diff diverged from main" })
map("n", "<leader>gf", "<cmd>DiffviewFileHistory %<cr>", { desc = "Git history - this file" })
map("v", "<leader>gf", "<cmd>'<,'>DiffviewFileHistory<cr>", { desc = "Git history - selection" })
map("n", "<leader>gl", function() require("gitgraph").draw({}, { max_count = 500 }) end, { desc = "GitGraph - Draw" })
map("n", "<leader>gL", function() require("gitgraph").draw({}, { all = true, max_count = 500 }) end, { desc = "GitGraph - Draw all" })
map("n", "<leader>hR", "<cmd>Gitsigns reset_hunk<cr>", { desc = "Reset hunk" })
map("n", "]h", "<cmd>Gitsigns next_hunk<cr>", { desc = "Next hunk" })
map("n", "[h", "<cmd>Gitsigns prev_hunk<cr>", { desc = "Prev hunk" })
map("n", "<leader>hh", "<cmd>Gitsigns preview_hunk_inline<cr>", { desc = "Preview hunk" })
map("n", "<leader>hb", "<cmd>Gitsigns blame_line<cr>", { desc = "Blame line" })

-- Tabs
map("n", "<leader>tt", "<cmd>tabnew<cr>", { desc = "New tab" })
map("n", "<leader>tq", "<cmd>tabclose<cr>", { desc = "Close tab" })
map("n", "<leader>to", "<cmd>tabonly<cr>", { desc = "Keep only this tab" })
map("n", "<leader><tab>", "<cmd>tabnext<cr>", { desc = "Next tab" })
map("n", "<leader><s-tab>", "<cmd>tabprevious<cr>", { desc = "Previous tab" })

-- Window
map("n", "<C-l>", "<C-w>l", { desc = "Move to right window" })
map("n", "<C-h>", "<C-w>h", { desc = "Move to left window" })
map("n", "<C-j>", "<C-w>j", { desc = "Move to bottom window" })
map("n", "<C-k>", "<C-w>k", { desc = "Move to top window" })
map("n", "<leader>q", "<C-w>q", { desc = "Close window" })
map("n", "<C-Up>", ":resize -2<cr>", { desc = "Decrease window height" })
map("n", "<C-Down>", ":resize +2<cr>", { desc = "Increase window height" })
map("n", "<C-Right>", ":vertical resize +2<cr>", { desc = "Increase window width" })
map("n", "<C-Left>", ":vertical resize -2<cr>", { desc = "Decrease window width" })

-- Editing
map({ "n", "v" }, "<c-X>", "<c-x>", { desc = "Decrease number" })
map({ "n", "v" }, "<c-A>", "<c-a>", { desc = "Increment number" })
map("v", "<leader>p", '"_dP', { desc = "Paste without copying" })
map("n", "<leader>w", "<cmd>update<cr>", { desc = "Save" })
map("i", "jk", "<esc>", { desc = "Exit insert mode" })
map("n", "<C-_>", '"xyiwq/"xp<CR>N', { desc = "Search word under cursor" })
map("v", "<C-_>", '"xyq/"xp<CR>N', { desc = "Search selection" })
map("n", "<leader>r", [[:%s/\<<C-r><C-w>\>/<C-r><C-w>/gI<Left><Left><Left>]], { desc = "Search and replace word under cursor" })
map("n", "<leader>j", "J", { desc = "Merge lines" })
map("n", "<leader>J", function() require("treesj").toggle() end, { desc = "treesj" })
map("n", "J", "5j", { desc = "Go 5 lines down" })
map("n", "K", "5k", { desc = "Go 5 lines up" })
map("i", "<c-j>", "<esc><cmd>t.<cr>a", { desc = "Copy line" })
map("v", "<", "<gv", { desc = "Indent left" })
map("v", ">", ">gv", { desc = "Indent right" })
map("n", "<esc>", "<cmd>nohlsearch<cr>", { desc = "Clear search" })
map("v", "Y", "<cmd>CopyRelativePath<cr>", { desc = "Copy relative path" })
