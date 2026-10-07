# flow

A CLI that guides a [Port](https://app.getport.io) task from idea to merged PR, one agent session (Claude Code or Cursor) per stage:

```text
new → research (optional) → spec → impl → review → docs / terraform / announcement (optional) → done
```

flow tracks each task's progress, sets up its worktree in the background, launches (or resumes) the right agent session in the right directory with the right prompt, and checks that the stage produced what it should before moving on.

## Setup

```sh
bun install --cwd ~/.dotfiles/scripts/flow   # also done by setup.sh
```

`flow` is a shell function in `.zprofile`, not an alias, so `flow cd` can change the calling shell's directory: flow writes the target path to `$FLOW_CD_FILE`, and the function `cd`s there once flow exits.

It expects these on `PATH`: `bun`, `claude` and/or `agent` (Cursor CLI), `gh`, `port` (Port CLI), `git`, `yarn`, `assume` (Granted), and macOS's `open` and `osascript` (for notifications).

## Usage

Run `flow` with no arguments to pick an in-flight task and get its menu: the next stages, resolving the PR's conflicts (when it has any), a free session, go to the worktree, record an ADR, open the task or PR, archive.

| Command                                   | What it does                                                                                                                                              |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `flow new [text or URL]`                  | Create a Port task with `/create-task` (in the team's current iteration), or pick one of your assigned tasks, then verify it and start the worktree setup |
| `flow new --afk`                          | Same, but skip verification and grilling: write the spec and implement headlessly up to a draft PR                                                        |
| `flow research\|spec\|impl\|review [id]`  | Run a stage                                                                                                                                               |
| `flow docs\|terraform\|announcement [id]` | Run a follow-up stage, once `impl` is done                                                                                                                |
| `flow resume`                             | Open the menu of the most recently updated task                                                                                                           |
| `flow session [id]`                       | Start an agent session with the task's context, outside the stages                                                                                        |
| `flow adr [id]`                           | Record a decision with `/significant-decision-making` in the task's worktree                                                                              |
| `flow rebase [id]`                        | Rebase the PR onto `origin/main` and resolve its conflicts with `/rebase-pr` in the task's worktree                                                       |
| `flow cd [id]`                            | `cd` into the task's worktree (or a companion repo's)                                                                                                     |
| `flow status [id]`                        | Show in-flight tasks, their stages, setup state and PRs                                                                                                   |
| `flow open [id]` / `flow pr [id]`         | Open the task in Port / its PR                                                                                                                            |
| `flow archive [id]`                       | Drop the task from the in-flight list                                                                                                                     |
| `flow done [id]`                          | Set the task to Done in Port and archive it                                                                                                               |
| `flow prune`                              | Remove the worktrees (main and companion) of archived tasks; git keeps ones with uncommitted changes, and branches are kept                               |
| `flow prune --force`                      | Same, but also remove worktrees with uncommitted changes, discarding them                                                                                 |

When `[id]` is omitted, the task is inferred from the current branch, or picked from a list.

## Stages

| Stage          | Runs in                     | Prompt                                                                                                       | Done when                                                                  |
| -------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------- |
| `new`          | —                           | Opens the task in Port to verify                                                                             | You confirm it; the setup then runs in the background                      |
| `research`     | main repo                   | `/research` with a question from `$EDITOR`                                                                   | `.scratch/<id>/research.md` exists                                         |
| `spec`         | main repo                   | `/grill-me` on the task description, then `/to-spec`                                                         | `.scratch/<id>/spec.md` exists (also linked to the task's `spec` property) |
| `impl`         | task worktree               | `/implement` the spec, open a draft PR                                                                       | `gh` finds a PR for the branch                                             |
| `review`       | task worktree               | `/code-review` from the merge-base with `origin/main`                                                        | You confirm it                                                             |
| `docs`         | port-docs worktree          | Document the change, open a draft PR                                                                         | `gh` finds a PR                                                            |
| `terraform`    | terraform-provider worktree | Support the change, open a draft PR                                                                          | `gh` finds a PR                                                            |
| `announcement` | task worktree               | `/product-announcement` (ends as a Slack draft)                                                              | You confirm it                                                             |
| `done`         | —                           | Sets the task to Done in Port and archives it (offered once `review` is done, alongside the optional stages) | Port accepts the update                                                    |

`impl`, `docs` and `terraform` let the agent act without asking (Claude's `auto` permission mode, Cursor's `--auto-review`). Each stage remembers its session ID, so rerunning a stage offers to resume it.

The worktree setup (after `new`) branches the task's `branch_name` off `origin/main` into `~/dev/worktrees/<repo>/<branch>`, runs `yarn install`, `yarn pkg:build`, `assume`, and pulls middlewares, then sets the task to In progress and sends a notification. It runs in a detached process, so it survives flow and the terminal exiting; stages that need the worktree offer to wait for it.

## Files and configuration

- Task state: `$FLOW_STATE_DIR` (default `$XDG_STATE_HOME/flow`, else `~/.local/state/flow`), one JSON file per task under `tasks/`, setup logs under `logs/`.
- Research and spec: `<main repo>/.scratch/<task id>/`.
- Worktrees: `~/dev/worktrees/<repo>/<branch>`.

| Variable             | Default                                        |
| -------------------- | ---------------------------------------------- |
| `PORT_MONO_DIR`      | `~/dev/port-labs/port`                         |
| `PORT_DOCS_DIR`      | `~/dev/port-labs/port-docs`                    |
| `PORT_TERRAFORM_DIR` | `~/dev/port-labs/terraform-provider-port-labs` |
| `FLOW_PORT_TEAM`     | `workflows_team`                               |
| `FLOW_STATE_DIR`     | see above                                      |

### Agents

The harness (the agent CLI) and the models are settings, in `AGENT_SETTINGS` (`src/agent-settings.ts`):

- `harnessFor`: the harness (`claude` or `cursor`) of every stage and other session; there's no default, so a new one must name its harness.
- `claude` / `cursor`: the model for each session, including when it's resumed. Claude takes a model and an optional effort (without one, Claude's settings pick it); Cursor model IDs carry the effort (`agent --list-models`).

Thinking-heavy sessions (`research`, `spec`, `impl`, `review`, the AFK run, free sessions) use Opus; writing and mechanical ones (`/create-task`, `/update-task`, `docs`, `announcement`, `adr`) use Sonnet at medium effort, and `rebase` and `terraform` use Sonnet at high effort.

Recorded session IDs name their harness (`claude:<id>`, `cursor:<id>`), so a session always resumes on the harness that started it, even after `harnessFor` changes.

The domain only says what a session is for (its purpose) and whether the agent may act without asking; `src/harness/` turns that into each CLI's arguments. To add a harness, implement `Harness` (`src/harness/harness.ts`), add it to `HARNESSES` and its models to `AgentSettings`, and register it in `realAgent` (`src/harness/router.ts`).

Cursor can't limit a run to some tools, so `/create-task` (which Claude may only run with Port's tools) runs with `--approve-mcps` and relies on the allowlist in `~/.cursor/cli-config.json` for shell commands.

## Development

```sh
bun test
bun run typecheck
bun run lint     # bun run format to fix
```

All side effects (agents, processes, prompts, files, git, the state store) go through the `Effects` interface in `src/effects.ts`. `src/real-effects.ts` implements it for real; tests use the fakes in `test/fakes.ts`, so commands are tested end to end without touching Port, GitHub or an agent.

The task state schema is versioned (`STATE_VERSION` in `src/state.ts`); when changing it, bump the version and add a migration.
