return {
	{
		"github/copilot.vim",
		event = "VeryLazy",
	},

	{
		"olimorris/codecompanion.nvim",
		opts = {
			ignore_warnings = true,
			prompt_library = {
				["Generate a Commit Message inline"] = {
					strategy = "inline",
					description = "Generate a commit message",
					opts = {
						is_default = true,
						is_slash_cmd = true,
						short_name = "commitmsg",
						auto_submit = true,
					},
					prompts = {
						{
							role = "user",
							content = function()
								return string.format(
									[[You are an expert at following the Conventional Commit specification. Given the git diff listed below, please generate a commit message for me:

```diff
%s
```
]],
									vim.fn.system("git diff --no-ext-diff --staged")
								)
							end,
							opts = {
								contains_code = true,
							},
						},
					},
				},
			},
		},
		dependencies = {
			"nvim-lua/plenary.nvim",
			"nvim-treesitter/nvim-treesitter",
		},
	},
}
