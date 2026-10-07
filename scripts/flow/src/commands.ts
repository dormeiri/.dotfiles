import { basename } from "node:path";
import { runAfk } from "./afk.ts";
import { type Context, loadTask } from "./context.ts";
import type { Choice } from "./effects.ts";
import { errorMessage } from "./errors.ts";
import {
  chooseNext,
  runAdrSession,
  runDescriptionSession,
  runFreeSession,
  runFrom,
  runRebaseSession,
} from "./guide.ts";
import { parseTaskIdMarker } from "./marker.ts";
import {
  currentIterationQuery,
  fetchPortTask,
  type Iteration,
  MY_TASKS_QUERY,
  type MyTask,
  myTaskChoice,
  parseCurrentIteration,
  parseMyTasks,
  sortMyTasks,
  taskUrl,
} from "./port.ts";
import { type PrStage, type PrStatus, prRefs, type TaskPrs } from "./pr.ts";
import { resolveTask } from "./resolve.ts";
import { worktreePath } from "./setup.ts";
import { nextChoices, STAGE_LABELS, setupGate } from "./stage-machine.ts";
import { createTaskPrompt } from "./stage-prompts.ts";
import {
  COMPANION_STAGES,
  newTaskState,
  type SessionStage,
  type Stage,
  type TaskState,
} from "./state.ts";
import { describeNext, formatStatus, groupByPhase, PHASE_LABELS, taskLabel } from "./status.ts";
import { notTracked } from "./store.ts";
import { artifactPaths } from "./task.ts";
import { editorResult, intakeTemplate } from "./templates.ts";

const NO_TASKS = "No tasks in flight. Start one with `flow new`.";

// gh is slow, so every PR is looked up at once; ones it can't find are left out.
async function fetchPrs(
  ctx: Context,
  tasks: TaskState[],
  stages: readonly PrStage[],
): Promise<Map<string, TaskPrs>> {
  const { fx, config } = ctx;
  const lookups = tasks.flatMap((task) =>
    prRefs(task, stages).map(([stage, ref]) => ({ taskId: task.taskId, stage, ref })),
  );
  const prs = new Map<string, TaskPrs>(tasks.map((task) => [task.taskId, {}]));
  if (lookups.length === 0) return prs;
  const spinner = fx.log.spinner("Checking PRs…");
  const statuses = await Promise.all(
    lookups.map(({ ref }) => fx.proc.prStatus(ref, config.mainRepo)),
  );
  spinner.clear();
  lookups.forEach(({ taskId, stage }, i) => {
    const status = statuses[i];
    const found = prs.get(taskId);
    if (status && found) found[stage] = status;
  });
  return prs;
}

async function implPr(ctx: Context, task: TaskState): Promise<PrStatus | undefined> {
  return (await fetchPrs(ctx, [task], ["impl"])).get(task.taskId)?.impl;
}

async function pickTask(
  ctx: Context,
  message: string,
  tasks: TaskState[],
  prs: Map<string, TaskPrs>,
): Promise<string | undefined> {
  const choices = groupByPhase(tasks).flatMap(({ phase, tasks }) =>
    tasks.map(
      (task): Choice<string> => ({
        value: task.taskId,
        label: taskLabel(task, prs.get(task.taskId)?.impl),
        hint: describeNext(task),
        group: PHASE_LABELS[phase],
      }),
    ),
  );
  return ctx.fx.prompts.filterSelect(message, choices);
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
    case "pick": {
      const { candidates } = resolution;
      return pickTask(ctx, "Which task?", candidates, await fetchPrs(ctx, candidates, ["impl"]));
    }
  }
}

async function pickMyTask(ctx: Context, message: string): Promise<string | undefined> {
  const { fx } = ctx;
  let tasks: MyTask[];
  try {
    tasks = sortMyTasks(parseMyTasks(await fx.proc.searchPortEntities("task", MY_TASKS_QUERY)));
  } catch (error) {
    fx.log.error(`Couldn't list your tasks from Port (${errorMessage(error)}).`);
    return undefined;
  }
  if (tasks.length === 0) {
    fx.log.warn("You have no open tasks in the current or next iteration.");
    return undefined;
  }
  return fx.prompts.filterSelect(message, tasks.map(myTaskChoice));
}

async function trackTask(ctx: Context, taskId: string): Promise<string> {
  const { fx, config } = ctx;
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

async function adoptMyTask(ctx: Context): Promise<string | undefined> {
  const taskId = await pickMyTask(ctx, "Which of your tasks?");
  if (!taskId) return undefined;
  if (await ctx.fx.prompts.confirm("Open it in the browser?")) await openTask(ctx, taskId);
  return trackTask(ctx, taskId);
}

async function currentIteration(ctx: Context): Promise<Iteration | undefined> {
  const { fx, config } = ctx;
  try {
    const query = currentIterationQuery(config.portTeam);
    const iteration = parseCurrentIteration(
      await fx.proc.searchPortEntities("team_iteration", query),
    );
    if (iteration) return iteration;
    fx.log.warn(`${config.portTeam} has no current iteration, so /create-task picks one.`);
  } catch (error) {
    fx.log.warn(
      `Couldn't find ${config.portTeam}'s current iteration (${errorMessage(error)}), so /create-task picks one.`,
    );
  }
  return undefined;
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

  const iteration = await currentIteration(ctx);
  const spinner = fx.log.spinner("Creating the task with /create-task…");
  const { output } = await fx.agent.headless({
    purpose: "createTask",
    cwd: config.mainRepo,
    prompt: createTaskPrompt(context, iteration),
    access: "port-only",
    addDirs: [],
  });
  let taskId = parseTaskIdMarker(output);
  spinner.stop(taskId ? `Created ${taskId}` : "/create-task didn't report a TASK_ID");
  if (!taskId) {
    fx.log.message(output || "(no output)");
    taskId = await pickMyTask(ctx, "Which task did /create-task create?");
    if (!taskId) {
      fx.log.warn("No task picked.");
      return undefined;
    }
  }
  return trackTask(ctx, taskId);
}

type NewSource = "create" | "mine";

export async function newCommand(
  ctx: Context,
  input: string | undefined,
  { afk = false }: { afk?: boolean } = {},
): Promise<void> {
  const { fx } = ctx;
  const source: NewSource | undefined = input?.trim()
    ? "create"
    : await fx.prompts.select("Start from", [
        { value: "create", label: "A new task" },
        { value: "mine", label: "One of my assigned tasks" },
      ]);
  if (!source) return;
  const taskId = source === "mine" ? await adoptMyTask(ctx) : await createTask(ctx, input);
  if (!taskId) return;
  if (afk) return runAfk(ctx, taskId);
  if (!(await loadTask(ctx, taskId)).stages.new.done) {
    if (
      source === "mine" &&
      (await fx.prompts.confirm("Iterate on the description with the agent (/update-task) first?"))
    ) {
      await runDescriptionSession(ctx, taskId);
    }
    return runFrom(ctx, taskId, "new");
  }
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

type HomeAction =
  | Stage
  | "rebase"
  | "session"
  | "cd"
  | "adr"
  | "open-task"
  | "open-pr"
  | "archive"
  | "later";

function homeActions(task: TaskState, pr: PrStatus | undefined): Choice<HomeAction>[] {
  // impl opens the PR, but it can also be opened by hand once the spec is done.
  const mayHavePr = Boolean(task.prUrl) || task.stages.spec.done;
  const conflicted = pr?.state === "open" && pr.conflicts;
  return [
    ...nextChoices(task).map((stage) => ({ value: stage, label: STAGE_LABELS[stage] })),
    ...(conflicted
      ? [{ value: "rebase" as const, label: "Resolve the PR's conflicts (/rebase-pr)" }]
      : []),
    { value: "session", label: "New session" },
    ...(task.worktreePath ? [{ value: "cd" as const, label: "Go to the worktree" }] : []),
    { value: "adr", label: "Record a decision (ADR)" },
    { value: "open-task", label: "Open task in Port" },
    ...(mayHavePr ? [{ value: "open-pr" as const, label: "Open PR" }] : []),
    { value: "archive", label: "Archive" },
    { value: "later", label: "Later" },
  ];
}

export async function homeCommand(ctx: Context): Promise<void> {
  const tasks = await inFlight(ctx);
  if (tasks.length === 0) return;
  const prs = await fetchPrs(ctx, tasks, ["impl"]);
  const taskId = await pickTask(ctx, "Pick up a task", tasks, prs);
  if (taskId) await taskMenu(ctx, taskId, prs.get(taskId)?.impl);
}

export async function resumeCommand(ctx: Context): Promise<void> {
  const [latest] = (await inFlight(ctx)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  if (!latest) return;
  ctx.fx.log.info(`Resuming ${latest.title} (${latest.taskId})`);
  await taskMenu(ctx, latest.taskId, await implPr(ctx, latest));
}

async function taskMenu(ctx: Context, taskId: string, initialPr?: PrStatus): Promise<void> {
  let pr = initialPr;
  // Sessions, opening and a declined archive return to the menu, so the task can still be continued.
  while (true) {
    const task = await loadTask(ctx, taskId);
    const action = await ctx.fx.prompts.filterSelect(
      `What next for ${taskId}?`,
      homeActions(task, pr),
    );
    switch (action) {
      case "rebase":
        await runRebaseSession(ctx, taskId);
        pr = await implPr(ctx, task);
        break;
      case "session":
        await runFreeSession(ctx, taskId);
        break;
      case "cd":
        // The shell only moves once flow exits.
        if (await goToWorktree(ctx, task)) return;
        break;
      case "adr":
        await runAdrSession(ctx, taskId);
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

async function worktreeChoices(ctx: Context, task: TaskState): Promise<Choice<string>[]> {
  const { fx, config } = ctx;
  const choices = task.worktreePath
    ? [{ value: task.worktreePath, label: basename(config.mainRepo) }]
    : [];
  const { branch } = task;
  if (!branch) return choices;
  for (const stage of COMPANION_STAGES) {
    const repo = config.companionRepos[stage];
    const dir = worktreePath(config, branch, repo);
    if (await fx.fs.exists(dir)) choices.push({ value: dir, label: basename(repo) });
  }
  return choices;
}

// True when the shell will cd once flow exits.
async function goToWorktree(ctx: Context, task: TaskState): Promise<boolean> {
  const { fx } = ctx;
  const choices = await worktreeChoices(ctx, task);
  const [only] = choices;
  if (!only) {
    fx.log.warn(`${task.taskId} has no worktree yet.`);
    return false;
  }
  const dir =
    choices.length === 1 ? only.value : await fx.prompts.select("Which worktree?", choices);
  if (!dir) return false;
  if (!(await fx.changeDir(dir))) {
    fx.log.info(`flow wasn't started from the \`flow\` shell function, so cd yourself: cd ${dir}`);
    return false;
  }
  fx.log.success(`Moving to ${dir}`);
  return true;
}

export async function cdCommand(ctx: Context, explicit: string | undefined): Promise<void> {
  const taskId = await resolveTaskId(ctx, explicit);
  if (taskId) await goToWorktree(ctx, await loadTask(ctx, taskId));
}

export async function adrCommand(ctx: Context, explicit: string | undefined): Promise<void> {
  const taskId = await resolveTaskId(ctx, explicit);
  if (taskId) await runAdrSession(ctx, taskId);
}

export async function rebaseCommand(ctx: Context, explicit: string | undefined): Promise<void> {
  const taskId = await resolveTaskId(ctx, explicit);
  if (taskId) await runRebaseSession(ctx, taskId);
}

export async function statusCommand(ctx: Context, explicit: string | undefined): Promise<void> {
  const { fx } = ctx;
  const tasks = explicit ? [await loadTask(ctx, explicit)] : await inFlight(ctx);
  const prs = await fetchPrs(ctx, tasks, ["impl", ...COMPANION_STAGES]);
  for (const { phase, tasks: inPhase } of groupByPhase(tasks)) {
    if (!explicit) fx.log.step(PHASE_LABELS[phase]);
    for (const task of inPhase) {
      fx.log.message(formatStatus(task, setupGate(task, fx.proc.isAlive), prs.get(task.taskId)));
    }
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
