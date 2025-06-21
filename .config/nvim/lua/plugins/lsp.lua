return {
	{
		"VonHeikemen/lsp-zero.nvim",
		branch = "v4.x",
		lazy = true,
		config = false,
	},

	{
		"williamboman/mason.nvim",
		lazy = false,
		opts = {},
	},

	-- Autocompletion
	{
		"hrsh7th/nvim-cmp",
		event = "InsertEnter",
		config = function()
			local cmp = require("cmp")

			cmp.setup({
				preselect = "item",
				completion = {
					completeopt = "menu,menuone,noinsert",
				},
				sources = {
					{
						name = "nvim_lsp",
					},
					per_filetype = {
						codecompanion = { "codecompanion" },
					},
				},
				mapping = cmp.mapping.preset.insert({
					["<CR>"] = cmp.mapping.confirm({ select = true }),
					["<C-u>"] = cmp.mapping.scroll_docs(-4),
					["<C-d>"] = cmp.mapping.scroll_docs(4),
				}),
				snippet = {
					expand = function(args)
						vim.snippet.expand(args.body)
					end,
				},
				window = {
					completion = cmp.config.window.bordered(),
					documentation = cmp.config.window.bordered(),
				},
				formatting = {
					format = require("nvim-highlight-colors").format,
				},
			})
		end,
	},

	-- LSP
	{
		"neovim/nvim-lspconfig",
		cmd = { "LspInfo", "LspInstall", "LspStart" },
		event = { "BufReadPre", "BufNewFile" },
		dependencies = {
			{ "hrsh7th/cmp-nvim-lsp" },
			{ "williamboman/mason.nvim" },
			{ "williamboman/mason-lspconfig.nvim" },
		},

		init = function()
			-- Reserve a space in the gutter
			-- This will avoid an annoying layout shift in the screen
			vim.opt.signcolumn = "yes"
		end,

		config = function()
			local lsp_defaults = require("lspconfig").util.default_config

			-- Add cmp_nvim_lsp capabilities settings to lspconfig
			-- This should be executed before you configure any language server
			lsp_defaults.capabilities =
				vim.tbl_deep_extend("force", lsp_defaults.capabilities, require("cmp_nvim_lsp").default_capabilities())

			lsp_defaults.on_attach = function(_, bufnr)
				vim.api.nvim_create_autocmd("CursorHold", {
					buffer = bufnr,
					callback = function()
						local opts = {
							focusable = false,
							close_events = { "BufLeave", "CursorMoved", "InsertEnter", "FocusLost" },
							border = "rounded",
							source = "always",
							prefix = " ",
							scope = "cursor",
						}
						vim.diagnostic.open_float(nil, opts)
					end,
				})
			end

			require("mason-lspconfig").setup({
				ensure_installed = {
					"lua_ls",
					-- 'eslint',
					"vtsls",
					"bashls",
					"html",
					"cssls",
					"jsonls",
					"yamlls",
					"terraformls",
					"tailwindcss",
					"dockerls",
					"gopls",
				},
				handlers = {
					-- this first function is the "default handler"
					-- it applies to every language server without a "custom handler"
					function(server_name)
						require("lspconfig")[server_name].setup({})
					end,
					["jdtls"] = function()
						require("lspconfig").jdtls.setup({
							cmd = {
								"jdtls",
								"--jvm-arg="
									.. string.format("-javaagent:%s", vim.fn.expand("$MASON/share/jdtls/lombok.jar")),
							},
						})
					end,
				},
			})
		end,
	},

	{
		"nvimtools/none-ls.nvim",
		dependencies = {
			"nvimtools/none-ls-extras.nvim",
		},
		config = function()
			local none_ls = require("null-ls")
			local augroup = vim.api.nvim_create_augroup("LspFormatting", {})
			local eslint_with_options = {
				condition = function(utils)
					return utils.root_has_file({
						".eslintrc",
						".eslintrc.json",
						".eslintrc.js",
						".eslintrc.cjs",
						".eslintrc.mjs",
						".eslintrc.yaml",
						".eslintrc.yml",
						"eslint.config.js",
						"eslint.config.mjs",
						"eslint.config.cjs",
						"eslint.config.ts",
						"eslint.config.mts",
						"eslint.config.cts",
					})
				end,
			}
			none_ls.setup({
				sources = {
					none_ls.builtins.formatting.stylua,
					none_ls.builtins.formatting.prettier.with({
						condition = function(utils)
							return utils.root_has_file({
								".prettierrc",
								".prettierrc.json",
								".prettierrc.json5",
								".prettierrc.yaml",
								".prettierrc.yml",
								".prettierrc.js",
								".prettierrc.cjs",
								".prettierrc.mjs",
								".prettierrc.toml",
								"prettier.config.js",
								"prettier.config.cjs",
								"prettier.config.mjs",
							})
						end,
					}),
					require("none-ls.code_actions.eslint_d").with(eslint_with_options),
					require("none-ls.diagnostics.eslint_d").with(eslint_with_options),
					require("none-ls.formatting.eslint_d").with(eslint_with_options),
				},
				on_attach = function(client, bufnr)
					if client.supports_method("textDocument/formatting") then
						vim.api.nvim_clear_autocmds({ group = augroup, buffer = bufnr })
						vim.api.nvim_create_autocmd("BufWritePre", {
							group = augroup,
							buffer = bufnr,
							callback = function()
								vim.lsp.buf.format({
									filter = function(client)
										return client.name == "null-ls"
									end,
									bufnr = bufnr,
								})
							end,
						})
					end
				end,
			})
		end,
	},

	{
		"brenoprata10/nvim-highlight-colors",
		opts = {},
	},

	{
		"chrisgrieser/nvim-chainsaw",
		event = "VeryLazy",
		opts = {
			logStatements = {
				emojiLog = {
					javascript = 'console.log(new Date(), "{{marker}} {{emoji}}", {{var}});',
				},
			},
		},
	},
}
