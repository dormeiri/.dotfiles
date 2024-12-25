local which_key = require("which-key")

local harpoon = require("harpoon")

which_key.add({
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
		"<leader><tab>",
		function()
			harpoon:list():prev()
		end,
		desc = "Next Harpoon",
		mode = "n",
	},
	{
		"<leader><s-tab>",
		function()
			harpoon:list():next()
		end,
		desc = "Previous Harpoon",
		mode = "n",
	},

	-- Telescope
	{
		"<leader><leader>",
		"<cmd>Telescope find_files<cr>",
		desc = "Find file",
		mode = "n",
	},
	{
		"<leader>r",
		"<cmd>Telescope oldfiles<cr>",
		desc = "Recent files",
		mode = "n",
	},
	{
		"<leader>f",
		"<cmd>Telescope live_grep_args<cr>",
		desc = "Live grep",
		mode = "n",
	},
	{
		"<leader>F",
		"<cmd>Grug<cr>",
		desc = "Search and replace",
		mode = "n",
	},
	{
		"<leader>b",
		"<cmd>Telescope buffers sort_mru=true<cr>",
		desc = "Buffers",
		mode = "n",
	},
	{
		"<leader>d",
		"<cmd>Telescope diff diff_current<cr>",
		desc = "Diff",
		mode = "n",
	},
	{
		"<leader>-",
		"<cmd>Telescope project<cr>",
		desc = "Projects",
		mode = "n",
	},
	{
		"_",
		"<cmd>Telescope file_browser<cr>",
		desc = "Open file browser in current folder",
		mode = "n",
	},
	{
		"-",
		"<cmd>Telescope file_browser path=%:p:h select_buffer=true<cr>",
		desc = "Open file browser in root",
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

	-- Copilot
	{
		"<leader>cc",
		"<cmd>CodeCompanionChat Toggle<cr>",
		desc = "Code Companion Chat",
		mode = { "n", "v" },
	},
	{
		"<leader>ci",
		"<cmd>CodeCompanionActions<cr>",
		desc = "Code Companion Actions",
		mode = { "n", "v" },
	},
	{
		"<leader>cp",
		"<cmd>CodeCompanionChat Add<cr>",
		desc = "Code Companion Add",
		mode = "v",
	},

	-- Git
	{
		"<leader>gb",
		"<cmd>Telescope git_branches<cr>",
		desc = "Git branches",
		mode = "n",
	},
	{
		"<leader>gs",
		"<cmd>Neogit<cr>",
		desc = "Git status",
		mode = "n",
	},
	{
		"<leader>gdd",
		"<cmd>DiffviewOpen<cr>",
		desc = "Git diff",
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
			require("gitgraph").draw({}, { all = true })
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
		"tt",
		"<cmd>tabnew<cr>",
		desc = "New tab",
		mode = "n",
	},
	{
		"tq",
		"<cmd>tabclose<cr>",
		desc = "Close tab",
		mode = "n",
	},
	{
		"to",
		"<cmd>tabonly<cr>",
		desc = "Keep only this tab",
		mode = "n",
	},
	{
		"<tab>",
		"<cmd>tabnext<cr>",
		desc = "Next tab",
		mode = "n",
	},
	{
		"<S-tab>",
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
		"<C-q>",
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
		"<leader>s",
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

	-- Misc
	{
		"<leader>qb",
		"<cmd>%bd<cr>",
		desc = "Delete all buffers",
		mode = "n",
	},
	{
		"<esc>",
		"<cmd>nohlsearch<cr>",
		desc = "Clear search",
		mode = "n",
	},
})
