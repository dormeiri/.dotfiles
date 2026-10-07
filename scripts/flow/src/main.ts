#!/usr/bin/env bun
import { intro, log } from "@clack/prompts";
import { Command } from "commander";
import {
  adrCommand,
  archiveCommand,
  cdCommand,
  doneCommand,
  homeCommand,
  newCommand,
  openCommand,
  prCommand,
  pruneCommand,
  rebaseCommand,
  resumeCommand,
  sessionCommand,
  stageCommand,
  statusCommand,
} from "./commands.ts";
import { loadConfig } from "./config.ts";
import type { Context } from "./context.ts";
import { errorMessage } from "./errors.ts";
import { realEffects } from "./real-effects.ts";
import type { SessionStage } from "./state.ts";

const config = loadConfig();
const ctx: Context = { fx: realEffects(config), config, cwd: process.cwd() };

const program = new Command("flow")
  .description("Guide a Port task through new → research → spec → impl → review")
  .hook("preAction", () => intro("flow"))
  .action(() => homeCommand(ctx));

program
  .command("new")
  .description(
    "Create a Port task from text, a URL, or $EDITOR, or pick one of your assigned tasks, then set up its worktree",
  )
  .argument("[input...]", "the signal: text or a URL (asks new or assigned task when omitted)")
  .option("--afk", "skip verification and grilling: spec and implement headlessly up to a draft PR")
  .action((input: string[], opts: { afk?: boolean }) =>
    newCommand(ctx, input.join(" "), { afk: opts.afk }),
  );

const stages: [SessionStage, string][] = [
  ["research", "Research the task in the main repo"],
  ["spec", "Grill the task's approved description into a spec"],
  ["impl", "Implement the spec in the worktree and open a draft PR"],
  ["review", "Review the branch in a fresh session"],
  ["docs", "Document the change in port-docs and open a draft PR"],
  ["terraform", "Support the change in the Terraform provider and open a draft PR"],
  ["announcement", "Draft a product announcement in Slack with /product-announcement"],
];
for (const [stage, description] of stages) {
  program
    .command(stage)
    .description(description)
    .argument("[id]", "task ID (inferred from the branch, else picked)")
    .action((id?: string) => stageCommand(ctx, stage, id));
}

program
  .command("resume")
  .description("Show the menu of the most recently updated in-flight task")
  .action(() => resumeCommand(ctx));

program
  .command("session")
  .description("Start a new agent session for the task, outside the stages")
  .argument("[id]", "task ID (inferred from the branch, else picked)")
  .action((id?: string) => sessionCommand(ctx, id));

program
  .command("cd")
  .description("cd into the task's worktree (needs the `flow` shell function)")
  .argument("[id]", "task ID (inferred from the branch, else picked)")
  .action((id?: string) => cdCommand(ctx, id));

program
  .command("adr")
  .description("Record a significant decision for the task as an ADR, at any stage")
  .argument("[id]", "task ID (inferred from the branch, else picked)")
  .action((id?: string) => adrCommand(ctx, id));

program
  .command("rebase")
  .description("Rebase the task's PR onto main and resolve its conflicts with /rebase-pr")
  .argument("[id]", "task ID (inferred from the branch, else picked)")
  .action((id?: string) => rebaseCommand(ctx, id));

program
  .command("status")
  .description("Show in-flight tasks, their stages and setup state")
  .argument("[id]", "a single task to show")
  .action((id?: string) => statusCommand(ctx, id));

program
  .command("open")
  .description("Open the task in Port")
  .argument("[id]", "task ID (inferred from the branch, else picked)")
  .action((id?: string) => openCommand(ctx, id));

program
  .command("pr")
  .description("Open the task's PR")
  .argument("[id]", "task ID (inferred from the branch, else picked)")
  .action((id?: string) => prCommand(ctx, id));

program
  .command("archive")
  .description("Remove the task from the in-flight list")
  .argument("[id]", "task ID (inferred from the branch, else picked)")
  .action((id?: string) => archiveCommand(ctx, id));

program
  .command("done")
  .description("Set the task to Done in Port and archive it")
  .argument("[id]", "task ID (inferred from the branch, else picked)")
  .action((id?: string) => doneCommand(ctx, id));

program
  .command("prune")
  .description("Remove the worktrees of archived tasks (refuses ones with uncommitted changes)")
  .option("--force", "also remove worktrees with uncommitted changes, discarding them")
  .action((opts: { force?: boolean }) => pruneCommand(ctx, { force: opts.force }));

try {
  await program.parseAsync();
} catch (error) {
  log.error(errorMessage(error));
  process.exitCode = 1;
}
