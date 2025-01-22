return {
	{
		"dormeiri/catppuccin-nvim",
		name = "catppuccin",
		lazy = false,
		priority = 1000,
		opts = {
			integrations = {
				diffview = true,
				gitgraph = true,
				mason = true,
				noice = true,
				copilot_vim = true,
				notify = true,
				which_key = true,
				harpoon = true,
			},
		},
	},
}
