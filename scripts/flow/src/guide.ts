import { randomUUID } from "node:crypto";
import { dirname } from "node:path";
import type { Config } from "./config.ts";
import type { ClaudeLaunch, Effects, PortTask } from "./effects.ts";
import { errorMessage } from "./errors.ts";
import {
  mainRepoWarning,
  nextChoices,
  runsInWorktree,
  STAGE_LABELS,
  setupGate,
} from "./stage-machine.ts";
import { grillPrompt, implementPrompt, researchPrompt, reviewPrompt } from "./stage-prompts.ts";
import type { SessionStage, Stage, TaskState } from "./state.ts";
import { taskUrl } from "./task.ts";
import { editorResult, researchTemplate, solutionTemplate, type TaskDetails } from "./templates.ts";

export interface Context {
  fx: Effects;
  config: Config;
  cwd: string;
}

const ASSUME_PROFILE = "Local/DeveloperAccess";
const SETUP_POLL_MS = 2000;

export async function loadTask(ctx: Context, taskId: string): Promise<TaskState> {
  const task = await ctx.fx.store.get(taskId);
  if (!task) throw new Error(`${taskId} isn't tracked by flow`);
  return task;
}

export async function runFrom(ctx: Context, taskId: string, stage: Stage): Promise<void> {
  let current: Stage | undefined = stage;
  while (current) {
    if (!(await runStage(ctx, taskId, current))) return;
    current = await chooseNext(ctx, taskId, { confirmSingle: true });
  }
}

export async function chooseNext(
  ctx: Context,
  taskId: string,
  { confirmSingle }: { confirmSingle: boolean },
): Promise<Stage | undefined> {
  const { fx } = ctx;
  const choices = nextChoices(await loadTask(ctx, taskId));
  const [first] = choices;
  if (!first) {
    fx.log.success(
      `${taskId} went through every stage. Run \`flow archive ${taskId}\` once it's merged.`,
    );
    return undefined;
  }
  let chosen: Stage | undefined;
  if (choices.length === 1) {
    const accepted =
      !confirmSingle || (await fx.prompts.confirm(`Continue to ${STAGE_LABELS[first]}?`));
    chosen = accepted ? first : undefined;
  } else {
    const answer = await fx.prompts.select(`What next for ${taskId}?`, [
      ...choices.map((stage) => ({ value: stage, label: STAGE_LABELS[stage] })),
      { value: "later", label: "Later" },
    ]);
    chosen = answer === "later" ? undefined : answer;
  }
  if (!chosen) fx.log.info("Pick it up later with `flow`.");
  return chosen;
}

function runStage(ctx: Context, taskId: string, stage: Stage): Promise<boolean> {
  return stage === "new" ? verifyTask(ctx, taskId) : runSession(ctx, taskId, stage);
}

async function verifyTask(ctx: Context, taskId: string): Promise<boolean> {
  const { fx } = ctx;
  await refreshTaskDetails(ctx, await loadTask(ctx, taskId));
  const url = taskUrl(taskId);
  await fx.proc.openUrl(url);
  fx.log.info(`Opened ${url}`);
  if (!(await fx.prompts.confirm("Does the task look right?"))) {
    fx.log.info("Fix it in Port (or with /update-task), then run `flow` to continue.");
    return false;
  }
  if (!(await startSetup(ctx, taskId))) return false;
  await fx.store.update(taskId, (task) => {
    task.stages.new.done = true;
  });
  return true;
}

export async function startSetup(ctx: Context, taskId: string): Promise<boolean> {
  const { fx } = ctx;
  // Setup runs `assume` too; authenticating here first means the background run never waits on an SSO prompt.
  if (!(await fx.proc.assume(ASSUME_PROFILE))) {
    fx.log.error(`\`assume ${ASSUME_PROFILE}\` failed, so the worktree setup wasn't started.`);
    return false;
  }
  const logPath = fx.store.setupLogPath(taskId);
  await fx.store.update(taskId, (task) => {
    task.setup = { status: "running", logPath };
  });
  fx.proc.spawnSetupRunner(taskId, logPath);
  fx.log.info(
    `Setting up the worktree in the background (log: ${logPath}). You'll get a notification.`,
  );
  return true;
}

async function runSession(ctx: Context, taskId: string, stage: SessionStage): Promise<boolean> {
  const cwd = await sessionCwd(ctx, taskId, stage);
  if (!cwd) return false;
  while (true) {
    const launch = await planLaunch(ctx, await loadTask(ctx, taskId), stage, cwd);
    if (!launch) return false;
    const { session } = launch;
    if (session.kind === "fresh") {
      await ctx.fx.store.update(taskId, (task) => {
        task.stages[stage].sessionId = session.id;
      });
    }
    await ctx.fx.proc.claudeInteractive(launch);
    const outcome = await finishSession(ctx, taskId, stage, cwd);
    if (outcome !== "retry") return outcome === "done";
  }
}

async function sessionCwd(
  ctx: Context,
  taskId: string,
  stage: SessionStage,
): Promise<string | undefined> {
  const { fx, config } = ctx;
  if (runsInWorktree(stage)) return ensureWorktree(ctx, taskId);
  const warning = mainRepoWarning(await fx.git.currentBranch(config.mainRepo));
  if (warning) fx.log.warn(warning);
  await fx.fs.ensureDir(dirname((await loadTask(ctx, taskId)).specPath));
  return config.mainRepo;
}

async function ensureWorktree(ctx: Context, taskId: string): Promise<string | undefined> {
  const { fx } = ctx;
  while (true) {
    const gate = setupGate(await loadTask(ctx, taskId), fx.proc.isAlive);
    switch (gate.kind) {
      case "ready":
        return gate.worktreePath;
      case "not-started":
        fx.log.error(
          "The worktree setup hasn't started yet. Run `flow` to verify the task and start it.",
        );
        return undefined;
      case "running": {
        fx.log.info(`The worktree setup is still running (log: ${gate.logPath}).`);
        const choice = await fx.prompts.select("Setup isn't done yet", [
          { value: "wait", label: "Wait (tail the setup log)" },
          { value: "exit", label: "Exit, I'll come back later" },
        ]);
        if (choice !== "wait") return undefined;
        await waitForSetup(ctx, taskId, gate.logPath);
        break;
      }
      case "failed": {
        fx.log.error(
          `The worktree setup failed${gate.reason ? `: ${gate.reason}` : ""}. Log: ${gate.logPath}`,
        );
        const { worktreePath } = gate;
        const choice = await fx.prompts.select("Fix the cause, then", [
          ...(worktreePath
            ? [{ value: "fixed" as const, label: `I fixed it in ${worktreePath}, continue` }]
            : []),
          { value: "retry", label: "Retry the setup in the background" },
          { value: "exit", label: "Exit" },
        ]);
        if (choice === "fixed") {
          await fx.store.update(taskId, (task) => {
            task.setup = { status: "ready", logPath: gate.logPath };
          });
        } else if (choice !== "retry" || !(await startSetup(ctx, taskId))) {
          return undefined;
        }
        break;
      }
    }
  }
}

async function waitForSetup(ctx: Context, taskId: string, logPath: string): Promise<void> {
  const { fx } = ctx;
  const tail = fx.proc.tailLog(logPath);
  try {
    while (setupGate(await loadTask(ctx, taskId), fx.proc.isAlive).kind === "running") {
      await fx.sleep(SETUP_POLL_MS);
    }
  } finally {
    tail.stop();
  }
}

async function planLaunch(
  ctx: Context,
  task: TaskState,
  stage: SessionStage,
  cwd: string,
): Promise<ClaudeLaunch | undefined> {
  const options = {
    cwd,
    permissionMode: stage === "impl" ? ("auto" as const) : undefined,
    // Research and spec live in the main repo's .scratch/, outside the worktree.
    addDirs: runsInWorktree(stage) ? [dirname(task.specPath)] : [],
  };
  const previous = task.stages[stage].sessionId;
  if (previous) {
    const choice = await ctx.fx.prompts.select(`${STAGE_LABELS[stage]} already has a session`, [
      { value: "resume", label: "Resume it" },
      { value: "fresh", label: "Start a fresh session" },
    ]);
    if (!choice) return undefined;
    if (choice === "resume") return { ...options, session: { kind: "resume", id: previous } };
  }
  const prompt = await stagePrompt(ctx, task, stage, cwd);
  return prompt ? { ...options, session: { kind: "fresh", id: randomUUID(), prompt } } : undefined;
}

async function stagePrompt(
  ctx: Context,
  task: TaskState,
  stage: SessionStage,
  cwd: string,
): Promise<string | undefined> {
  const { fx } = ctx;
  const { taskId, specPath } = task;
  const researchPath = (await fx.fs.exists(task.researchPath)) ? task.researchPath : undefined;
  switch (stage) {
    case "research": {
      const template = researchTemplate(await refreshTaskDetails(ctx, task));
      const question = editorResult(template, await fx.proc.editText(template));
      if (!question) fx.log.warn("No question written, so research was cancelled.");
      return question && researchPrompt({ taskId, question, researchPath: task.researchPath });
    }
    case "spec": {
      const template = solutionTemplate(await refreshTaskDetails(ctx, task), researchPath);
      const solution = editorResult(template, await fx.proc.editText(template));
      if (!solution) fx.log.warn("No proposed solution written, so the spec was cancelled.");
      return solution && grillPrompt({ taskId, solution, specPath });
    }
    case "impl": {
      const hasSpec = await fx.fs.exists(specPath);
      if (
        !hasSpec &&
        !(await fx.prompts.confirm(`There's no spec at ${specPath}. Implement anyway?`))
      ) {
        return undefined;
      }
      return implementPrompt({ taskId, specPath, researchPath });
    }
    case "review": {
      const base = (await fx.git.mergeBase(cwd, "origin/main")) ?? "origin/main";
      return reviewPrompt({ taskId, specPath, base, prUrl: task.prUrl });
    }
  }
}

type SessionOutcome = "done" | "retry" | "leave";

async function finishSession(
  ctx: Context,
  taskId: string,
  stage: SessionStage,
  cwd: string,
): Promise<SessionOutcome> {
  const { fx } = ctx;
  const markDone = (prUrl?: string) =>
    fx.store.update(taskId, (task) => {
      task.stages[stage].done = true;
      if (prUrl) task.prUrl = prUrl;
    });

  if (stage === "review") {
    if (!(await fx.prompts.confirm("Is the review done?"))) {
      fx.log.info("Pick it up later with `flow review`.");
      return "leave";
    }
    await markDone();
    return "done";
  }

  const output = await findOutput(ctx, await loadTask(ctx, taskId), stage, cwd);
  if (output.found) {
    await markDone(output.prUrl);
    fx.log.success(`${STAGE_LABELS[stage]} done${output.prUrl ? `: ${output.prUrl}` : ""}.`);
    return "done";
  }
  fx.log.warn(`${STAGE_LABELS[stage]} didn't produce ${output.expected}.`);
  const choice = await fx.prompts.select("What now?", [
    { value: "retry", label: "Retry" },
    { value: "done", label: "Mark it done anyway" },
    { value: "leave", label: "Leave it for later" },
  ]);
  if (choice === "done") {
    await markDone();
    return "done";
  }
  if (choice !== "retry") fx.log.info(`Pick it up later with \`flow ${stage}\`.`);
  return choice ?? "leave";
}

async function findOutput(
  ctx: Context,
  task: TaskState,
  stage: Exclude<SessionStage, "review">,
  cwd: string,
): Promise<{ found: true; prUrl?: string } | { found: false; expected: string }> {
  if (stage === "impl") {
    const prUrl = await ctx.fx.proc.prUrl(cwd);
    return prUrl ? { found: true, prUrl } : { found: false, expected: "a PR for this branch" };
  }
  const path = stage === "research" ? task.researchPath : task.specPath;
  return (await ctx.fx.fs.exists(path)) ? { found: true } : { found: false, expected: path };
}

export async function fetchPortTask(ctx: Context, taskId: string): Promise<PortTask | undefined> {
  try {
    return await ctx.fx.proc.getPortTask(taskId);
  } catch (error) {
    ctx.fx.log.warn(`Couldn't fetch ${taskId} from Port (${errorMessage(error)}).`);
    return undefined;
  }
}

// Always read fresh from Port: the user is told to fix wrong tasks there, not in flow.
async function refreshTaskDetails(ctx: Context, task: TaskState): Promise<TaskDetails> {
  const { taskId } = task;
  const port = await fetchPortTask(ctx, taskId);
  if (!port) return { taskId, title: task.title, description: "" };
  await ctx.fx.store.update(taskId, (t) => {
    t.title = port.title;
    t.branch = port.branch ?? t.branch;
  });
  return { taskId, title: port.title, description: port.description };
}
