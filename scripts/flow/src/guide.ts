import { dirname } from "node:path";
import type { AgentLaunch } from "./agent.ts";
import { type Context, loadTask } from "./context.ts";
import { refreshTaskDetails, taskUrl } from "./port.ts";
import {
  existingWorktree,
  mainRepoWarning,
  SESSION_STAGES,
  type Session,
} from "./session-stages.ts";
import { AWS_PROFILE, companionWorktreeSteps, runSteps, worktreePath } from "./setup.ts";
import { nextChoices, nextStage, STAGE_LABELS, setupGate } from "./stage-machine.ts";
import {
  adrPrompt,
  describeTaskPrompt,
  freeSessionPrompt,
  rebasePrompt,
  type TaskContext,
} from "./stage-prompts.ts";
import type { CompanionStage, SessionStage, Stage, TaskState } from "./state.ts";
import { adrTemplate, editorResult } from "./templates.ts";

const SETUP_POLL_MS = 2000;

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
  const task = await loadTask(ctx, taskId);
  const choices = nextChoices(task);
  if (!nextStage(task)) {
    fx.log.success(`${taskId} went through every required stage. Mark it done once it's merged.`);
  }
  const [first] = choices;
  if (!first) return undefined;
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

async function runStage(ctx: Context, taskId: string, stage: Stage): Promise<boolean> {
  switch (stage) {
    case "new":
      return verifyTask(ctx, taskId);
    case "done":
      await completeTask(ctx, taskId);
      // The task is archived, so nothing follows.
      return false;
    default:
      return runSession(ctx, taskId, stage);
  }
}

export async function completeTask(ctx: Context, taskId: string): Promise<void> {
  const { fx } = ctx;
  await fx.proc.setPortTaskStatus(taskId, "Done");
  await fx.store.update(taskId, (task) => {
    task.stages.done.done = true;
    task.archived = true;
  });
  fx.log.success(`Set ${taskId} to Done in Port and archived it.`);
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
  if (!(await fx.proc.assume(AWS_PROFILE))) {
    fx.log.error(`\`assume ${AWS_PROFILE}\` failed, so the worktree setup wasn't started.`);
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
    const launch = await planLaunch({ ctx, task: await loadTask(ctx, taskId), stage, cwd });
    if (!launch) return false;
    const { session } = launch;
    if (session.kind === "fresh") {
      await ctx.fx.store.update(taskId, (task) => {
        task.stages[stage].sessionId = session.id;
      });
    }
    await ctx.fx.agent.interactive(launch);
    const outcome = await finishSession({ ctx, task: await loadTask(ctx, taskId), stage, cwd });
    if (outcome !== "retry") return outcome === "done";
  }
}

interface SideSession {
  task: TaskState;
  cwd: string;
  inWorktree: boolean;
  context: TaskContext;
}

// Sessions outside the stages run in the worktree once it's ready, else in the main repo.
async function sideSession(ctx: Context, taskId: string): Promise<SideSession> {
  const { fx, config } = ctx;
  const task = await loadTask(ctx, taskId);
  const gate = setupGate(task, fx.proc.isAlive);
  const inWorktree = gate.kind === "ready";
  const cwd = inWorktree ? gate.worktreePath : config.mainRepo;
  if (!inWorktree) {
    fx.log.info("The worktree isn't ready, so the session runs in the main repo.");
    const warning = mainRepoWarning(await fx.git.currentBranch(config.mainRepo));
    if (warning) fx.log.warn(warning);
  }
  const existing = async (path: string) => ((await fx.fs.exists(path)) ? path : undefined);
  const context = {
    taskId,
    branch: task.branch,
    specPath: await existing(task.specPath),
    researchPath: await existing(task.researchPath),
    prUrl: task.prUrl,
  };
  return { task, cwd, inWorktree, context };
}

async function launchFresh(
  ctx: Context,
  launch: Omit<AgentLaunch, "session" | "access"> & { prompt: string },
): Promise<void> {
  const { agent } = ctx.fx;
  const { prompt, ...rest } = launch;
  const id = await agent.newSession(launch.purpose);
  await agent.interactive({ ...rest, access: "ask", session: { kind: "fresh", id, prompt } });
}

function launchSideSession(
  ctx: Context,
  side: SideSession,
  purpose: "session" | "adr" | "rebase",
  prompt: string,
): Promise<void> {
  return launchFresh(ctx, {
    purpose,
    cwd: side.cwd,
    prompt,
    // Research and spec live in the main repo's .scratch/, outside the worktree.
    addDirs: side.inWorktree ? [dirname(side.task.specPath)] : [],
  });
}

// Runs before verification, so there's no worktree yet; the description lives in Port.
export async function runDescriptionSession(ctx: Context, taskId: string): Promise<void> {
  await launchFresh(ctx, {
    purpose: "describeTask",
    cwd: ctx.config.mainRepo,
    prompt: describeTaskPrompt(taskId),
    addDirs: [],
  });
}

// A session outside the stages: no stage prompt, no completion check, nothing marked done.
export async function runFreeSession(ctx: Context, taskId: string): Promise<void> {
  const side = await sideSession(ctx, taskId);
  await launchSideSession(ctx, side, "session", freeSessionPrompt(side.context));
}

// Optional at any stage, so like a free session nothing is marked done. The ADR belongs on the
// task's branch, so unlike a free session it waits for the worktree instead of using the main repo.
export async function runAdrSession(ctx: Context, taskId: string): Promise<void> {
  const { fx } = ctx;
  const template = adrTemplate(await refreshTaskDetails(ctx, await loadTask(ctx, taskId)));
  const decision = editorResult(template, await fx.proc.editText(template));
  if (!decision) {
    fx.log.warn("No decision written, so no ADR was started.");
    return;
  }
  if (!(await ensureWorktree(ctx, taskId))) return;
  const side = await sideSession(ctx, taskId);
  await launchSideSession(ctx, side, "adr", adrPrompt({ ...side.context, decision }));
}

// Rebasing rewrites the task's branch, so like an ADR it waits for the worktree.
export async function runRebaseSession(ctx: Context, taskId: string): Promise<void> {
  if (!(await ensureWorktree(ctx, taskId))) return;
  const side = await sideSession(ctx, taskId);
  await launchSideSession(ctx, side, "rebase", rebasePrompt(side.context));
}

async function sessionCwd(
  ctx: Context,
  taskId: string,
  stage: SessionStage,
): Promise<string | undefined> {
  const { fx, config } = ctx;
  switch (SESSION_STAGES[stage].workspace) {
    case "worktree":
      return ensureWorktree(ctx, taskId);
    case "companion":
      return ensureCompanionWorktree(ctx, taskId, stage as CompanionStage);
  }
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

async function ensureCompanionWorktree(
  ctx: Context,
  taskId: string,
  stage: CompanionStage,
): Promise<string | undefined> {
  const { fx, config } = ctx;
  const { branch } = await loadTask(ctx, taskId);
  if (!branch) {
    fx.log.error(`${taskId} has no branch yet, so there's no branch for the ${stage} PR.`);
    return undefined;
  }
  const repo = config.companionRepos[stage];
  const dir = worktreePath(config, branch, repo);
  if (await fx.fs.exists(dir)) return dir;
  const branchExists = await fx.git.branchExists(repo, branch);
  const error = await runSteps(fx, companionWorktreeSteps(repo, branch, dir, branchExists));
  if (error) {
    fx.log.error(`Couldn't create the ${stage} worktree: ${error}.`);
    return undefined;
  }
  return dir;
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

// Research and spec live in the main repo's .scratch/, outside any worktree. Main-repo stages
// write ADRs into the task's worktree; companion stages read the implementation from it.
async function stageAddDirs(ctx: Context, task: TaskState, stage: SessionStage): Promise<string[]> {
  const scratch = dirname(task.specPath);
  switch (SESSION_STAGES[stage].workspace) {
    case "main-repo": {
      const worktree = await existingWorktree(ctx, task);
      return worktree ? [worktree] : [];
    }
    case "worktree":
      return [scratch];
    case "companion":
      return task.worktreePath ? [scratch, task.worktreePath] : [scratch];
  }
}

async function planLaunch(session: Session): Promise<AgentLaunch | undefined> {
  const { ctx, task, stage, cwd } = session;
  const spec = SESSION_STAGES[stage];
  const options = {
    purpose: stage,
    cwd,
    access: spec.access ?? "ask",
    addDirs: await stageAddDirs(ctx, task, stage),
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
  const prompt = await spec.prompt(session);
  if (!prompt) return undefined;
  const id = await ctx.fx.agent.newSession(stage);
  return { ...options, session: { kind: "fresh", id, prompt } };
}

type SessionOutcome = "done" | "retry" | "leave";

async function finishSession(session: Session): Promise<SessionOutcome> {
  const { ctx, task, stage } = session;
  const { fx } = ctx;
  const isCompanion = SESSION_STAGES[stage].workspace === "companion";
  const markDone = (prUrl?: string) =>
    fx.store.update(task.taskId, (t) => {
      t.stages[stage].done = true;
      if (prUrl && isCompanion) t.stages[stage].prUrl = prUrl;
      else if (prUrl) t.prUrl = prUrl;
    });

  const { findOutput } = SESSION_STAGES[stage];
  if (!findOutput) {
    if (!(await fx.prompts.confirm(`Is the ${stage} done?`))) {
      fx.log.info(`Pick it up later with \`flow ${stage}\`.`);
      return "leave";
    }
    await markDone();
    return "done";
  }

  const output = await findOutput(session);
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
