local which_key = require("which-key")

local harpoon = require("harpoon")
local chainsaw = require("chainsaw")

which_key.add({
	-- Chainsaw
	{
		"<leader>ll",
		function()
			chainsaw:emojiLog()
		end,
		desc = "Chainsaw",
		mode = { "n", "v" },
	},
	{
		"<leader>lr",
		function()
			chainsaw:removeLogs()
		end,
		desc = "Chainsaw",
		mode = { "n", "v" },
	},
	-- Harpoon
	{
		"<leader>a",
		function()
			harpoon:list():add()
		end,
		desc = "Add Harpoon",
		mode = "n",
	},
	{
		"<leader>A",
		function()
			harpoon.ui:toggle_quick_menu(harpoon:list())
		end,
		desc = "List Harpoons",
		mode = "n",
	},
	{
		"<leader>1",
		function()
			harpoon:list():select(1)
		end,
		desc = "Harpoon 1",
		mode = "n",
	},
	{
		"<leader>2",
		function()
			harpoon:list():select(2)
		end,
		desc = "Harpoon 2",
		mode = "n",
	},
	{
		"<leader>3",
		function()
			harpoon:list():select(3)
		end,
		desc = "Harpoon 3",
		mode = "n",
	},
	{
		"<leader>4",
		function()
			harpoon:list():select(4)
		end,
		desc = "Harpoon 4",
		mode = "n",
	},
	{
		"<leader>5",
		function()
			harpoon:list():select(5)
		end,
		desc = "Harpoon 5",
		mode = "n",
	},

	-- Telescope
	{
		"<leader>f",
		"<cmd>GrugFar<cr>",
		desc = "Search and replace",
		mode = "n",
	},
	{
		"<leader>f",
		function()
			require("grug-far").with_visual_selection({
				prefills = {
					paths = vim.fn.expand("%"),
				},
			})
		end,
		desc = "Search and replace with visual selection in the current file",
		mode = "v",
	},
	{
		"<leader><C-f>",
		function()
			require("grug-far").open({ engine = "astgrep" })
		end,
		desc = "Search and replace with astgrep",
		mode = "n",
	},
	{
		"<leader>F",
		function()
			require("grug-far").open({
				visualSelectionUsage = "operate-within-range",
			})
		end,
		desc = "grug-far: Search within range",
		mode = "v",
	},
	{
		"<leader>F",
		function()
			require("grug-far").open({
				prefills = {
					search = vim.fn.expand("<cword>"),
					paths = vim.fn.expand("%"),
				},
			})
		end,
		desc = "Search and replace current word in current file",
		mode = "n",
	},

	-- Trouble
	{
		"<leader>x",
		"<cmd>Trouble diagnostics<cr>",
		desc = "Diagnostics (Trouble)",
		mode = "n",
	},
	{
		"gr",
		"<cmd>Telescope lsp_references<cr>",
		desc = "References (Telescope)",
		mode = "n",
	},
	{
		"gd",
		"<cmd>Telescope lsp_definitions<cr>",
		desc = "Definitions (Telescope)",
		mode = "n",
	},
	{
		"gD",
		"<cmd>Telescope lsp_declaration<cr>",
		desc = "Declaration (Telescope)",
		mode = "n",
	},
	{
		"gi",
		"<cmd>Telescope lsp_implementations<cr>",
		desc = "Implementations (Telescope)",
		mode = "n",
	},
	{
		"go",
		"<cmd>Telescope lsp_type_definitions<cr>",
		desc = "Type definitions (Telescope)",
		mode = "n",
	},
	{
		"<leader>s",
		function()
			require("telescope.builtin").lsp_document_symbols({ symbols = "Function" })
		end,
		desc = "Document symbols (Telescope)",
		mode = "n",
	},

	-- LSP
	{
		"gh",
		"<cmd>lua vim.lsp.buf.hover()<cr>",
		desc = "LSP Hover",
		mode = "n",
	},
	{
		"gs",
		"<cmd>lua vim.lsp.buf.signature_help()<cr>",
		desc = "LSP Siganture",
		mode = "n",
	},
	{
		"<leader>cr",
		"<cmd>lua vim.lsp.buf.rename()<cr>",
		desc = "LSP Rename",
		mode = "n",
	},
	{
		"<leader>ca",
		"<cmd>lua vim.lsp.buf.code_action()<cr>",
		desc = "LSP Actions",
		mode = "n",
	},

	-- Git
	{
		"<leader>gs",
		"<cmd>Neogit<cr>",
		desc = "Git status",
		mode = "n",
	},
	{
		"<leader>gdd",
		"<cmd>DiffviewFileHistory %<cr>",
		desc = "Git diff history - this file",
		mode = "n",
	},
	{
		"<leader>gdm",
		"<cmd>DiffviewOpen main<cr>",
		desc = "Git diff from main",
		mode = "n",
	},
	{
		"<leader>gl",
		function()
			require("gitgraph").draw({}, { all = true, max_count = 500 })
		end,
		desc = "GitGraph - Draw",
	},
	{
		"]h",
		"<cmd>Gitsigns next_hunk<cr>",
		desc = "Next hunk",
		mode = "n",
	},
	{
		"[h",
		"<cmd>Gitsigns prev_hunk<cr>",
		desc = "Next hunk",
		mode = "n",
	},
	{
		"<leader>hh",
		"<cmd>Gitsigns preview_hunk_inline<cr>",
		desc = "Preview hunk",
		mode = "n",
	},
	{
		"<leader>hb",
		"<cmd>Gitsigns blame_line<cr>",
		desc = "Blame line",
		mode = "n",
	},
	{
		"<leader>hR",
		"<cmd>Gitsigns reset_hunk<cr>",
		desc = "Reset hunk",
		mode = "n",
	},

	-- Tabs
	{
		"<leader>tt",
		"<cmd>tabnew<cr>",
		desc = "New tab",
		mode = "n",
	},
	{
		"<leader>tq",
		"<cmd>tabclose<cr>",
		desc = "Close tab",
		mode = "n",
	},
	{
		"<leader>to",
		"<cmd>tabonly<cr>",
		desc = "Keep only this tab",
		mode = "n",
	},
	{
		"<leader><tab>",
		"<cmd>tabnext<cr>",
		desc = "Next tab",
		mode = "n",
	},
	{
		"<leader><s-tab>",
		"<cmd>tabprevious<cr>",
		desc = "Previous tab",
		mode = "n",
	},

	-- Window
	{
		"<C-l>",
		"<C-w>l",
		desc = "Move to right window",
		mode = "n",
	},
	{
		"<C-h>",
		"<C-w>h",
		desc = "Move to left window",
		mode = "n",
	},
	{
		"<C-j>",
		"<C-w>j",
		desc = "Move to bottom window",
		mode = "n",
	},
	{
		"<C-k>",
		"<C-w>k",
		desc = "Move to top window",
		mode = "n",
	},
	{
		"<leader>q",
		"<C-w>q",
		desc = "Close window",
		mode = "n",
	},
	{
		"<C-Up>",
		":resize -2<cr>",
		desc = "Increase window height",
		mode = "n",
	},
	{
		"<C-Down>",
		":resize +2<cr>",
		desc = "Decrease window height",
		mode = "n",
	},
	{
		"<C-Right>",
		":vertical resize +2<cr>",
		desc = "Increase window width",
		mode = "n",
	},
	{
		"<C-Left>",
		":vertical resize -2<cr>",
		desc = "Decrease window width",
		mode = "n",
	},

	-- Type fast
	{
		"<c-X>",
		"<c-x>",
		desc = "Decrease number",
	},
	{
		"<c-A>",
		"<c-a>",
		desc = "Increment number",
	},
	{
		"<leader>p",
		'"_dP',
		desc = "Paste without copying",
		mode = "v",
	},
	{
		"<leader>w",
		"<cmd>update<cr>",
		desc = "Save",
		mode = "n",
	},
	{
		"jk",
		"<esc>",
		desc = "Exit insert mode",
		mode = "i",
	},
	{
		"<leader>r",
		[[:%s/\<<C-r><C-w>\>/<C-r><C-w>/gI<Left><Left><Left>]],
		desc = "Search and replace word under cursor",
		mode = "n",
	},
	{
		"<leader>j",
		"J",
		desc = "Merge lines",
		mode = "n",
	},
	{
		"<leader>J",
		function()
			require("treesj").toggle()
		end,
		desc = "treesj",
		mode = "n",
	},
	{
		"J",
		"5j",
		desc = "Go 5 lines down",
		mode = "n",
	},
	{
		"K",
		"5k",
		desc = "Go 5 lines up",
		mode = "n",
	},
	{
		"<c-j>",
		"<esc><cmd>t.<cr>a",
		desc = "Copy line",
		mode = "i",
	},
	{
		"<",
		"<gv",
		desc = "Indent left",
		mode = "v",
	},
	{
		">",
		">gv",
		desc = "Indent right",
		mode = "v",
	},
	{
		"<esc>",
		"<cmd>nohlsearch<cr>",
		desc = "Clear search",
		mode = "n",
	},
	-- AI
	{
		"<leader>\\",
		"<cmd>'<,'>CodeCompanion<cr>",
		desc = "CodeCompanion (visual selection)",
		mode = "v",
	},
	{
		"<leader>\\",
		"<cmd>CodeCompanionChat<cr>",
		desc = "CodeCompanionChat",
		mode = "n",
	},
})
