#!/usr/bin/env bun
import { intro, log } from "@clack/prompts";
import { Command } from "commander";
import {
  archiveCommand,
  homeCommand,
  newCommand,
  openCommand,
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
  .description("Create a Port task from text, a URL, or $EDITOR, then set up its worktree")
  .argument("[input...]", "the signal: text or a URL (opens $EDITOR when omitted)")
  .action((input: string[]) => newCommand(ctx, input.join(" ")));

const stages: [SessionStage, string][] = [
  ["research", "Research the task in the main repo"],
  ["spec", "Grill the task's approved description into a spec"],
  ["impl", "Implement the spec in the worktree and open a draft PR"],
  ["review", "Review the branch in a fresh session"],
];
for (const [stage, description] of stages) {
  program
    .command(stage)
    .description(description)
    .argument("[id]", "task ID (inferred from the branch, else picked)")
    .action((id?: string) => stageCommand(ctx, stage, id));
}

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
  .command("archive")
  .description("Remove the task from the in-flight list")
  .argument("[id]", "task ID (inferred from the branch, else picked)")
  .action((id?: string) => archiveCommand(ctx, id));

try {
  await program.parseAsync();
} catch (error) {
  log.error(errorMessage(error));
  process.exitCode = 1;
}
