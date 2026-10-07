---
name: rebase-pr
description: Rebase the current branch's PR onto origin/main, resolve conflicts, force-push, wait for checks, and restore its ready-for-review state.
argument-hint: "Base branch (optional, defaults to main)"
disable-model-invocation: true
---

Invoking this skill is the user's explicit request to rebase and force-push the current branch.

1. **Record the PR's ready state** with `gh pr view --json number,url,isDraft`. Pushing may trigger a workflow that converts the PR back to draft, so remember whether it was ready.

2. **Rebase.** Run `git fetch origin main && git rebase --autostash origin/main`. `--autostash` keeps uncommitted local changes out of the way and restores them at the end; never commit or discard them.

3. **Resolve each conflicted commit** then `git add` the files and `GIT_EDITOR=true git rebase --continue`. Repeat until the rebase completes.

4. **Verify** the resolved files: run the format check and typecheck for the affected workspaces. Ignore errors unrelated to the branch's files (for example, unbuilt workspace packages) and mention them in the summary.

5. **Push** with `git push --force-with-lease`. Never use plain `--force`.

6. **Wait for checks** with `gh pr checks <number> --watch --interval 60` in the background, and wait on it instead of sleeping. If a check fails, report it and stop; don't mark the PR ready.

7. **Restore the ready state.** If the PR was ready in step 1 and is now a draft, run `gh pr ready <number>`. If it was a draft in step 1, leave it as a draft.

Reply with the PR link, which commits had conflicts and how each was resolved, the check results, and whether the PR is ready. If marking it ready started more CI jobs, say they are still running.
