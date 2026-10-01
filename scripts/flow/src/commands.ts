import { type Context, fetchPortTask, loadTask } from "./context.ts";
import type { Choice } from "./effects.ts";
import { errorMessage } from "./errors.ts";
import { chooseNext, runFreeSession, runFrom } from "./guide.ts";
import { headlessResultText, parseTaskIdMarker } from "./marker.ts";
import {
  MY_TASKS_QUERY,
  type MyTask,
  myTaskChoice,
  parseMyTasks,
  sortMyTasks,
} from "./my-tasks.ts";
import { resolveTask } from "./resolve.ts";
import { nextChoices, STAGE_LABELS, setupGate } from "./stage-machine.ts";
import { createTaskPrompt } from "./stage-prompts.ts";
import { newTaskState, type SessionStage, type Stage, type TaskState } from "./state.ts";
import { describeNext, formatStatus } from "./status.ts";
import { notTracked } from "./store.ts";
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
      throw notTracked(resolution.taskId);
    case "none":
      ctx.fx.log.info(NO_TASKS);
      return undefined;
    case "pick":
      return ctx.fx.prompts.filterSelect("Which task?", resolution.candidates.map(taskChoice));
  }
}

async function pickMyTask(ctx: Context): Promise<string | undefined> {
  const { fx } = ctx;
  let tasks: MyTask[];
  try {
    tasks = sortMyTasks(parseMyTasks(await fx.proc.searchPortTasks(MY_TASKS_QUERY)));
  } catch (error) {
    fx.log.error(`Couldn't list your tasks from Port (${errorMessage(error)}).`);
    return undefined;
  }
  if (tasks.length === 0) {
    fx.log.warn("You have no open tasks in the current or next iteration.");
    return undefined;
  }
  return fx.prompts.filterSelect("Which task did /create-task create?", tasks.map(myTaskChoice));
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
    taskId = await pickMyTask(ctx);
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

type HomeAction = Stage | "session" | "open-task" | "open-pr" | "archive" | "later";

function homeActions(task: TaskState): Choice<HomeAction>[] {
  // impl opens the PR, but it can also be opened by hand once the spec is done.
  const mayHavePr = Boolean(task.prUrl) || task.stages.spec.done;
  return [
    ...nextChoices(task).map((stage) => ({ value: stage, label: STAGE_LABELS[stage] })),
    { value: "session", label: "New session" },
    { value: "open-task", label: "Open task in Port" },
    ...(mayHavePr ? [{ value: "open-pr" as const, label: "Open PR" }] : []),
    { value: "archive", label: "Archive" },
    { value: "later", label: "Later" },
  ];
}

export async function homeCommand(ctx: Context): Promise<void> {
  const tasks = await inFlight(ctx);
  if (tasks.length === 0) return;
  const taskId = await ctx.fx.prompts.filterSelect("Pick up a task", tasks.map(taskChoice));
  if (!taskId) return;
  // Sessions, opening and a declined archive return to the menu, so the task can still be continued.
  while (true) {
    const task = await loadTask(ctx, taskId);
    const action = await ctx.fx.prompts.select(`What next for ${taskId}?`, homeActions(task));
    switch (action) {
      case "session":
        await runFreeSession(ctx, taskId);
        break;
      case "open-task":
        await openTask(ctx, taskId);
        break;
      case "open-pr":
        await openPr(ctx, task);
        break;
      case "archive":
        if (await ctx.fx.prompts.confirm(`Archive ${taskId}? It leaves the in-flight list.`)) {
          return archiveTask(ctx, taskId);
        }
        break;
      case "later":
      case undefined:
        return;
      default:
        return runFrom(ctx, taskId, action);
    }
  }
}

export async function sessionCommand(ctx: Context, explicit: string | undefined): Promise<void> {
  const taskId = await resolveTaskId(ctx, explicit);
  if (taskId) await runFreeSession(ctx, taskId);
}

export async function statusCommand(ctx: Context, explicit: string | undefined): Promise<void> {
  const tasks = explicit ? [await loadTask(ctx, explicit)] : await inFlight(ctx);
  for (const task of tasks) {
    ctx.fx.log.message(formatStatus(task, setupGate(task, ctx.fx.proc.isAlive)));
  }
}

async function openTask(ctx: Context, taskId: string): Promise<void> {
  const url = taskUrl(taskId);
  await ctx.fx.proc.openUrl(url);
  ctx.fx.log.info(`Opened ${url}`);
}

async function openPr(ctx: Context, task: TaskState): Promise<void> {
  const { taskId } = task;
  // impl records the URL; a PR opened outside flow is still found through the worktree's branch.
  let url = task.prUrl;
  if (!url && task.worktreePath) {
    url = await ctx.fx.proc.prUrl(task.worktreePath);
    if (url) {
      const found = url;
      await ctx.fx.store.update(taskId, (t) => {
        t.prUrl = found;
      });
    }
  }
  if (!url) {
    ctx.fx.log.warn(`${taskId} has no PR yet.`);
    return;
  }
  await ctx.fx.proc.openUrl(url);
  ctx.fx.log.info(`Opened ${url}`);
}

export async function openCommand(ctx: Context, explicit: string | undefined): Promise<void> {
  // Any task can be opened, tracked by flow or not.
  const taskId = explicit ?? (await resolveTaskId(ctx, undefined));
  if (taskId) await openTask(ctx, taskId);
}

export async function prCommand(ctx: Context, explicit: string | undefined): Promise<void> {
  const taskId = await resolveTaskId(ctx, explicit);
  if (taskId) await openPr(ctx, await loadTask(ctx, taskId));
}

async function archiveTask(ctx: Context, taskId: string): Promise<void> {
  await ctx.fx.store.update(taskId, (task) => {
    task.archived = true;
  });
  ctx.fx.log.success(`Archived ${taskId}.`);
}

export async function archiveCommand(ctx: Context, explicit: string | undefined): Promise<void> {
  const taskId = await resolveTaskId(ctx, explicit);
  if (taskId) await archiveTask(ctx, taskId);
}
