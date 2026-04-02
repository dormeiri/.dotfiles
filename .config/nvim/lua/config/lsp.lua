-- Mason (for installing servers/tools)
require("mason").setup()

-- Blink completion
require("blink.cmp").setup({
	keymap = {
		preset = "enter",
	},
	appearance = { nerd_font_variant = "mono" },
	completion = {
		documentation = { auto_show = true, auto_show_delay_ms = 200 },
		list = { selection = { preselect = true, auto_insert = false } },
	},
	sources = { default = { "lsp", "path", "snippets", "buffer" } },
	signature = { enabled = true },
})

-- LSP config (wildcard applies to all servers)
vim.lsp.config("*", {
	capabilities = require("blink.cmp").get_lsp_capabilities(),
})

-- Enable servers (configs provided by nvim-lspconfig plugin)
vim.lsp.enable({
	"lua_ls",
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
})

-- Diagnostics float on CursorHold
vim.api.nvim_create_autocmd("CursorHold", {
	callback = function()
		vim.diagnostic.open_float(nil, {
			focusable = false,
			close_events = { "BufLeave", "CursorMoved", "InsertEnter", "FocusLost" },
			border = "rounded",
			source = "always",
			prefix = " ",
			scope = "cursor",
		})
	end,
})

-- Reserve sign column
vim.opt.signcolumn = "yes"

-- Conform (formatting)
require("conform").setup({
	formatters_by_ft = {
		lua = { "stylua" },
		javascript = { "prettier", stop_after_first = true },
		typescript = { "prettier", stop_after_first = true },
		typescriptreact = { "prettier", stop_after_first = true },
		javascriptreact = { "prettier", stop_after_first = true },
		html = { "prettier" },
		css = { "prettier" },
		scss = { "prettier" },
		json = { "prettier" },
		yaml = { "prettier" },
		markdown = { "prettier" },
	},
	format_on_save = {
		timeout_ms = 500,
		lsp_format = "fallback",
	},
})

-- nvim-lint (linting)
require("lint").linters_by_ft = {
	javascript = { "eslint_d" },
	typescript = { "eslint_d" },
	javascriptreact = { "eslint_d" },
	typescriptreact = { "eslint_d" },
}

vim.api.nvim_create_autocmd({ "BufWritePost", "InsertLeave", "TextChanged" }, {
	callback = function()
		require("lint").try_lint()
	end,
})
