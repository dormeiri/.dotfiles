import type { Choice } from "./effects.ts";
import { type Context, chooseNext, fetchPortTask, loadTask, runFrom } from "./guide.ts";
import { headlessResultText, parseTaskIdMarker } from "./marker.ts";
import { resolveTask } from "./resolve.ts";
import { setupGate } from "./stage-machine.ts";
import { createTaskPrompt } from "./stage-prompts.ts";
import { newTaskState, type SessionStage, type TaskState } from "./state.ts";
import { describeNext, formatStatus } from "./status.ts";
import { artifactPaths, taskUrl } from "./task.ts";
import { editorResult, intakeTemplate } from "./templates.ts";

// Port MCP is the claude.ai "Port IO" connector; the port-cli skill is the fallback /create-task names.
export const CREATE_TASK_TOOLS = ["mcp__claude_ai_Port_IO", "Bash(port:*)", "Skill(port-cli)"];

const NO_TASKS = "No tasks in flight. Start one with `flow new`.";

function taskChoice(task: TaskState): Choice<string> {
  return { value: task.taskId, label: `${task.taskId} · ${task.title}`, hint: describeNext(task) };
}

async function inFlight(ctx: Context): Promise<TaskState[]> {
  const tasks = (await ctx.fx.store.list()).filter((task) => !task.archived);
  if (tasks.length === 0) ctx.fx.log.info(NO_TASKS);
  return tasks;
}

async function resolveTaskId(
  ctx: Context,
  explicit: string | undefined,
): Promise<string | undefined> {
  const branch = explicit ? undefined : await ctx.fx.git.currentBranch(ctx.cwd);
  const resolution = resolveTask(explicit, branch, await ctx.fx.store.list());
  switch (resolution.kind) {
    case "found":
      return resolution.taskId;
    case "unknown":
      throw new Error(`${resolution.taskId} isn't tracked by flow.`);
    case "none":
      ctx.fx.log.info(NO_TASKS);
      return undefined;
    case "pick":
      return ctx.fx.prompts.pick("Which task?", resolution.candidates.map(taskChoice));
  }
}

async function createTask(ctx: Context, input: string | undefined): Promise<string | undefined> {
  const { fx, config } = ctx;
  let context = input?.trim();
  if (!context) {
    const template = intakeTemplate();
    context = editorResult(template, await fx.proc.editText(template));
  }
  if (!context) {
    fx.log.warn("Nothing written, so no task was created.");
    return undefined;
  }

  const spinner = fx.log.spinner("Creating the task with /create-task…");
  const result = await fx.proc.claudeHeadless({
    cwd: config.mainRepo,
    prompt: createTaskPrompt(context),
    allowedTools: CREATE_TASK_TOOLS,
  });
  const output = headlessResultText(result.stdout);
  let taskId = parseTaskIdMarker(output);
  spinner.stop(taskId ? `Created ${taskId}` : "/create-task didn't report a TASK_ID");
  if (!taskId) {
    fx.log.message(output.trim() || result.stderr.trim() || "(no output)");
    fx.log.info("Pick the task from your task list instead.");
    taskId = await fx.proc.pickPortTask();
    if (!taskId) {
      fx.log.warn("No task picked.");
      return undefined;
    }
  }

  if (await fx.store.get(taskId)) {
    fx.log.info(`${taskId} is already tracked.`);
    return taskId;
  }
  const port = await fetchPortTask(ctx, taskId);
  await fx.store.create(
    newTaskState({
      taskId,
      title: port?.title ?? taskId,
      branch: port?.branch,
      ...artifactPaths(config.mainRepo, taskId),
      now: new Date(),
    }),
  );
  return taskId;
}

export async function newCommand(ctx: Context, input: string | undefined): Promise<void> {
  const taskId = await createTask(ctx, input);
  if (!taskId) return;
  if (!(await loadTask(ctx, taskId)).stages.new.done) return runFrom(ctx, taskId, "new");
  const next = await chooseNext(ctx, taskId, { confirmSingle: true });
  if (next) await runFrom(ctx, taskId, next);
}

export async function stageCommand(
  ctx: Context,
  stage: SessionStage,
  explicit: string | undefined,
): Promise<void> {
  const taskId = await resolveTaskId(ctx, explicit);
  if (taskId) await runFrom(ctx, taskId, stage);
}

export async function homeCommand(ctx: Context): Promise<void> {
  const tasks = await inFlight(ctx);
  if (tasks.length === 0) return;
  const taskId = await ctx.fx.prompts.pick("Pick up a task", tasks.map(taskChoice));
  if (!taskId) return;
  const next = await chooseNext(ctx, taskId, { confirmSingle: false });
  if (next) await runFrom(ctx, taskId, next);
}

export async function statusCommand(ctx: Context, explicit: string | undefined): Promise<void> {
  const tasks = explicit ? [await loadTask(ctx, explicit)] : await inFlight(ctx);
  for (const task of tasks) {
    ctx.fx.log.message(formatStatus(task, setupGate(task, ctx.fx.proc.isAlive)));
  }
}

export async function openCommand(ctx: Context, explicit: string | undefined): Promise<void> {
  // Any task can be opened, tracked by flow or not.
  const taskId = explicit ?? (await resolveTaskId(ctx, undefined));
  if (!taskId) return;
  const url = taskUrl(taskId);
  await ctx.fx.proc.openUrl(url);
  ctx.fx.log.info(`Opened ${url}`);
}

export async function archiveCommand(ctx: Context, explicit: string | undefined): Promise<void> {
  const taskId = await resolveTaskId(ctx, explicit);
  if (!taskId) return;
  await ctx.fx.store.update(taskId, (task) => {
    task.archived = true;
  });
  ctx.fx.log.success(`Archived ${taskId}.`);
}
