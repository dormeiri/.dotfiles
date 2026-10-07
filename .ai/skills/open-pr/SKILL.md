---
name: open-pr
description: Open a GitHub pull request in the browser.
argument-hint: "PR number or URL (optional)"
disable-model-invocation: true
---

Open the pull request in the user's browser with `gh pr view <pr> --web`.

Pick the PR in this order:

1. The PR number or URL the user passed as an argument.
2. The PR being discussed in the current conversation.
3. The PR for the current branch: run `gh pr view --web` with no argument.

If no PR is found, say so. Do not create one.

Reply with one line that links to the PR you opened.
