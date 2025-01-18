return {
	{
		"nvim-tree/nvim-web-devicons",
		lazy = true,
	},

	{
		"stevearc/dressing.nvim",
		event = "VeryLazy",
	},

	{
		"MeanderingProgrammer/render-markdown.nvim",
		ft = {
			"markdown",
			"codecompanion",
		},
	},

	{
		"RRethy/vim-illuminate",
		config = function()
			require("illuminate").configure({})
		end,
	},

	{
		-- I like it because of the code comments highlighting
		-- I don't really use its features
		"folke/todo-comments.nvim",
		dependencies = { "nvim-lua/plenary.nvim" },
		opts = {},
	},

	{
		"akinsho/toggleterm.nvim",
		version = "*",
		opts = {},
	},

	{
		"folke/noice.nvim",
		event = "VeryLazy",
		dependencies = {
			"MunifTanjim/nui.nvim",
			"rcarriga/nvim-notify",
		},
		config = function()
			require("notify").setup({
				stages = "static",
				timeout = 3000,
			})
			require("noice").setup({
				lsp = {
					override = {
						["vim.lsp.util.convert_input_to_markdown_lines"] = true,
						["vim.lsp.util.stylize_markdown"] = true,
						["cmp.entry.get_documentation"] = true,
					},
				},
				presets = {
					lsp_doc_border = true,
				},
				routes = {
					{
						filter = {
							event = "msg_show",
							kind = "",
							find = "written",
						},
						opts = { skip = true },
					},
				},
			})
		end,
	},

	{
		"folke/trouble.nvim",
		opts = {
			focus = true,
			win = {
				wo = {
					wrap = true,
				},
			},
		},
		cmd = "Trouble",
	},

	{
		"lukas-reineke/indent-blankline.nvim",
		main = "ibl",
		opts = {},
	},

	{
		"nvim-treesitter/nvim-treesitter",
		build = ":TSUpdate",
		config = function()
			local configs = require("nvim-treesitter.configs")

			configs.setup({
				ensure_installed = {
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
				},
				sync_install = false,
				highlight = { enable = true },
				indent = { enable = true },
			})
		end,
	},

	{
		"nvim-treesitter/nvim-treesitter-context",
		opts = {},
	},

	{
		"b0o/incline.nvim",
		config = function()
			require("incline").setup({
				window = {
					padding = 0,
					margin = { horizontal = 0, vertical = 0 },
				},
				render = function(props)
					local buffullname = vim.api.nvim_buf_get_name(props.buf)
					local bufname_t = vim.fn.fnamemodify(buffullname, ":t")
					local bufname = (bufname_t and bufname_t ~= "")
							and require("plenary").path:new(buffullname):make_relative()
						or "[No Name]"

					-- optional devicon
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

					local colors = require("onedarkpro.helpers").get_preloaded_colors()
					local guibg = colors.bg
					local guifg = modified and colors.yellow or colors.fg

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
		end,
		-- Optional: Lazy load Incline
		event = "VeryLazy",
	},

	{
		"nvim-lualine/lualine.nvim",
		dependencies = {
			"nvim-tree/nvim-web-devicons",
			"yavorski/lualine-macro-recording.nvim",
		},
		config = function()
			local lualine = require("lualine")

			local section_b = lualine.get_config().sections.lualine_b
			table.insert(section_b, 1, function()
				return vim.api.nvim_call_function("fnamemodify", { vim.loop.cwd(), ":t" })
			end)

			local section_c = {}

			lualine.setup({
				theme = "onedark",
				sections = {
					lualine_b = section_b,
					lualine_c = section_c,
					lualine_x = { "filetype", "macro_recording" },
				},
				options = {
					globalstatus = true,
				},
			})
		end,
	},

	{
		"nvim-telescope/telescope.nvim",
		dependencies = {
			"nvim-lua/plenary.nvim",
			{
				"nvim-telescope/telescope-live-grep-args.nvim",
				-- This will not install any breaking changes.
				-- For major updates, this must be adjusted manually.
				version = "^1.0.0",
			},
			"nvim-telescope/telescope-project.nvim",
			"nvim-telescope/telescope-file-browser.nvim",
		},
		config = function()
			local actions = require("telescope.actions")
			local project_actions = require("telescope._extensions.project.actions")
			local telescope = require("telescope")

			telescope.setup({
				defaults = {
					file_ignore_patterns = { ".git/" },
					path_display = { "filename_first" },
					dynamic_preview_title = true,
					results_title = false,
					prompt_title = false,
					sorting_strategy = "ascending",
					layout_config = {
						prompt_position = "top",
						width = 0.95,
						height = 0.9,
					},
				},
				pickers = {
					find_files = {
						theme = "dropdown",
						previewer = false,
						hidden = true,
					},
					buffers = {
						mappings = {
							i = { ["<C-d>"] = actions.delete_buffer },
						},
					},
					oldfiles = {
						theme = "dropdown",
						only_cwd = true,
						previewer = false,
					},
					git_branches = {
						theme = "dropdown",
						mappings = {
							i = { ["<cr>"] = actions.git_switch_branch },
						},
					},
				},
				extensions = {
					file_browser = {
						hijack_netrw = true,
						hidden = true,
						display_stat = false,
					},
					project = {
						theme = "dropdown",
						on_project_selected = project_actions.change_working_directory,
					},
				},
			})
			telescope.load_extension("live_grep_args")
			telescope.load_extension("file_browser")
			telescope.load_extension("project")
			telescope.load_extension("rest")
		end,
	},

	{
		"rest-nvim/rest.nvim",
	},
}
