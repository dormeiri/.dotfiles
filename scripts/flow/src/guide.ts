import { randomUUID } from "node:crypto";
import { dirname } from "node:path";
import { type Context, loadTask, refreshTaskDetails } from "./context.ts";
import type { ClaudeLaunch } from "./effects.ts";
import { mainRepoWarning, SESSION_STAGES, type Session } from "./session-stages.ts";
import { AWS_PROFILE } from "./setup.ts";
import { nextChoices, STAGE_LABELS, setupGate } from "./stage-machine.ts";
import { freeSessionPrompt } from "./stage-prompts.ts";
import type { SessionStage, Stage } from "./state.ts";
import { taskUrl } from "./task.ts";

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
    await ctx.fx.proc.claudeInteractive(launch);
    const outcome = await finishSession({ ctx, task: await loadTask(ctx, taskId), stage, cwd });
    if (outcome !== "retry") return outcome === "done";
  }
}

// A session outside the stages: no stage prompt, no completion check, nothing marked done.
export async function runFreeSession(ctx: Context, taskId: string): Promise<void> {
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
  const prompt = freeSessionPrompt({
    taskId,
    branch: task.branch,
    specPath: await existing(task.specPath),
    researchPath: await existing(task.researchPath),
    prUrl: task.prUrl,
  });
  await fx.proc.claudeInteractive({
    cwd,
    session: { kind: "fresh", id: randomUUID(), prompt },
    // Research and spec live in the main repo's .scratch/, outside the worktree.
    addDirs: inWorktree ? [dirname(task.specPath)] : [],
  });
}

async function sessionCwd(
  ctx: Context,
  taskId: string,
  stage: SessionStage,
): Promise<string | undefined> {
  const { fx, config } = ctx;
  if (SESSION_STAGES[stage].inWorktree) return ensureWorktree(ctx, taskId);
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

async function planLaunch(session: Session): Promise<ClaudeLaunch | undefined> {
  const { ctx, task, stage, cwd } = session;
  const spec = SESSION_STAGES[stage];
  const options = {
    cwd,
    permissionMode: spec.permissionMode,
    // Research and spec live in the main repo's .scratch/, outside the worktree.
    addDirs: spec.inWorktree ? [dirname(task.specPath)] : [],
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
  return prompt ? { ...options, session: { kind: "fresh", id: randomUUID(), prompt } } : undefined;
}

type SessionOutcome = "done" | "retry" | "leave";

async function finishSession(session: Session): Promise<SessionOutcome> {
  const { ctx, task, stage } = session;
  const { fx } = ctx;
  const markDone = (prUrl?: string) =>
    fx.store.update(task.taskId, (t) => {
      t.stages[stage].done = true;
      if (prUrl) t.prUrl = prUrl;
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
