-- Theme
require("catppuccin").setup({
	integrations = {
		diffview = true,
		gitgraph = true,
		mason = true,
		noice = true,
		copilot_vim = true,
		notify = true,
		harpoon = true,
	},
})
vim.cmd.colorscheme("catppuccin")

-- Treesitter (highlighting/indent are builtin in 0.12, plugin just installs parsers)
require("nvim-treesitter").install({
	"lua",
	"vim",
	"vimdoc",
	"javascript",
	"html",
	"python",
	"typescript",
	"hcl",
	"terraform",
	"http",
	"markdown",
	"json",
	"yaml",
	"css",
	"scss",
	"dockerfile",
	"bash",
	"csv",
	"diff",
	"go",
	"sql",
	"regex",
	"jq",
})

require("treesitter-context").setup()

-- UI
require("nvim-highlight-colors").setup()
require("illuminate").configure({})
require("todo-comments").setup()
require("nvim-surround").setup({})
require("mini.align").setup()

require("notify").setup({
	stages = "static",
	timeout = 3000,
})

require("noice").setup({
	lsp = {
		override = {
			["vim.lsp.util.convert_input_to_markdown_lines"] = true,
			["vim.lsp.util.stylize_markdown"] = true,
		},
	},
	presets = {
		bottom_search = true,
		command_palette = true,
		long_message_to_split = true,
		inc_rename = false,
		lsp_doc_border = false,
	},
})

require("trouble").setup({
	focus = true,
	win = {
		wo = {
			wrap = true,
		},
	},
})

-- indent-blankline
require("ibl").setup()
local indent_blankline_augroup = vim.api.nvim_create_augroup("indent_blankline_augroup", { clear = true })
vim.api.nvim_create_autocmd("ModeChanged", {
	group = indent_blankline_augroup,
	pattern = "[vV\x16]*:*",
	command = "IBLEnable",
	desc = "Enable indent-blankline when exiting visual mode",
})
vim.api.nvim_create_autocmd("ModeChanged", {
	group = indent_blankline_augroup,
	pattern = "*:[vV\x16]*",
	command = "IBLDisable",
	desc = "Disable indent-blankline when entering visual mode",
})

-- Incline
require("incline").setup({
	window = {
		padding = 0,
		margin = { horizontal = 0, vertical = 0 },
	},
	render = function(props)
		local buffullname = vim.api.nvim_buf_get_name(props.buf)
		local bufname_t = vim.fn.fnamemodify(buffullname, ":t")
		local bufname = (bufname_t and bufname_t ~= "") and require("plenary").path:new(buffullname):make_relative()
			or "[No Name]"

		local devicon = { " " }
		local success, nvim_web_devicons = pcall(require, "nvim-web-devicons")
		if success then
			local bufname_r = vim.fn.fnamemodify(buffullname, ":r")
			local bufname_e = vim.fn.fnamemodify(buffullname, ":e")
			local base = (bufname_r and bufname_r ~= "") and bufname_r or bufname
			local ext = (bufname_e and bufname_e ~= "") and bufname_e or vim.fn.fnamemodify(base, ":t")
			local ic, hl = nvim_web_devicons.get_icon(base, ext, { default = true })
			devicon = {
				ic,
				" ",
				group = hl,
			}
		end

		local modified = vim.bo[props.buf].modified

		local colors = require("catppuccin.palettes").get_palette("mocha")
		local guibg = colors.base
		local guifg = modified and colors.yellow or colors.text

		return {
			" ",
			devicon,
			bufname,
			modified and " ●" or "",
			" ",
			guibg = guibg,
			guifg = guifg,
		}
	end,
})

-- Lualine
require("lualine").setup({
	theme = "catppuccin",
	sections = {
		lualine_b = {},
		lualine_c = { "macro_recording", "searchcount" },
		lualine_x = { "filetype" },
		lualine_y = { "branch", "diff" },
		lualine_z = {},
	},
	options = {
		section_separators = "",
		component_separators = "",
		globalstatus = true,
	},
})

-- Navigation
require("mini.files").setup({
	windows = {
		preview = true,
	},
	mappings = {
		go_in = "L",
		go_in_plus = "l",
	},
})

require("telescope").setup()
require("harpoon"):setup()

require("grug-far").setup({
	transient = true,
	maxSearchMatches = 100,
	debounceMs = 1000,
	minSearchChars = 3,
})

require("treesj").setup()

-- Git
require("gitsigns").setup()
require("neogit").setup()
require("gitblame").setup({
	display_virtual_text = 0,
})
require("gitgraph").setup({
	hooks = {
		on_select_commit = function(commit)
			vim.notify("DiffviewOpen " .. commit.hash .. "^!")
			vim.cmd(":DiffviewOpen " .. commit.hash .. "^!")
		end,
		on_select_range_commit = function(from, to)
			vim.notify("DiffviewOpen " .. from.hash .. "~1.." .. to.hash)
			vim.cmd(":DiffviewOpen " .. from.hash .. "~1.." .. to.hash)
		end,
	},
})

-- Pre-initialize fff scanner after startup
vim.schedule(function()
	require("fff.core").ensure_initialized()
end)
