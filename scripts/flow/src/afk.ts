import { randomUUID } from "node:crypto";
import { dirname } from "node:path";
import { type Context, loadTask, refreshTaskDetails } from "./context.ts";
import type { HeadlessLaunch } from "./effects.ts";
import { startSetup } from "./guide.ts";
import { headlessResultText } from "./marker.ts";
import { existingWorktree, mainRepoWarning } from "./session-stages.ts";
import { notificationTitle } from "./setup.ts";
import { type SetupGate, setupGate } from "./stage-machine.ts";
import { afkSpecPrompt, implementPrompt } from "./stage-prompts.ts";
import type { SessionStage } from "./state.ts";
import { editedText, specTemplate } from "./templates.ts";

const SETUP_POLL_MS = 5000;

// Nobody is there to answer prompts: verification is skipped and every stage runs headlessly.
export async function runAfk(ctx: Context, taskId: string): Promise<void> {
  const task = await loadTask(ctx, taskId);
  if (!task.stages.new.done) {
    // `assume` may still need an SSO login, so it runs before anything else.
    if (!(await startSetup(ctx, taskId))) {
      await fail(ctx, taskId, "the worktree setup didn't start");
      return;
    }
    await ctx.fx.store.update(taskId, (t) => {
      t.stages.new.done = true;
    });
  }
  if (!task.stages.spec.done && !(await afkSpec(ctx, taskId))) return;
  if (!task.stages.impl.done && !(await afkImpl(ctx, taskId))) return;
  const { prUrl } = await loadTask(ctx, taskId);
  ctx.fx.log.success(
    `${taskId} is implemented${prUrl ? `: ${prUrl}` : ""}. Review it with \`flow review ${taskId}\`.`,
  );
  await ctx.fx.notify(notificationTitle(taskId), `Draft PR ready${prUrl ? `: ${prUrl}` : ""}`);
}

async function afkSpec(ctx: Context, taskId: string): Promise<boolean> {
  const { fx, config } = ctx;
  const task = await loadTask(ctx, taskId);
  const warning = mainRepoWarning(await fx.git.currentBranch(config.mainRepo));
  if (warning) fx.log.warn(warning);
  await fx.fs.ensureDir(dirname(task.specPath));
  const research = (await fx.fs.exists(task.researchPath)) ? task.researchPath : undefined;
  const text = editedText(specTemplate(await refreshTaskDetails(ctx, task), research)) ?? "";
  const worktree = await existingWorktree(ctx, task);
  const prompt = afkSpecPrompt({ taskId, task: text, specPath: task.specPath, worktree });
  await runHeadless(ctx, taskId, "spec", {
    cwd: config.mainRepo,
    prompt,
    permissionMode: "auto",
    addDirs: worktree ? [worktree] : [],
  });
  if (!(await fx.fs.exists(task.specPath))) {
    return fail(ctx, taskId, `the spec wasn't written to ${task.specPath}`);
  }
  await fx.store.update(taskId, (t) => {
    t.stages.spec.done = true;
  });
  fx.log.success(`Spec written: ${task.specPath}`);
  return true;
}

async function afkImpl(ctx: Context, taskId: string): Promise<boolean> {
  const { fx } = ctx;
  const gate = await waitForSetup(ctx, taskId);
  if (gate.kind !== "ready") {
    const reason = gate.kind === "failed" && gate.reason ? `: ${gate.reason}` : "";
    return fail(ctx, taskId, `the worktree isn't ready${reason}`);
  }
  const cwd = gate.worktreePath;
  const task = await loadTask(ctx, taskId);
  const prompt = implementPrompt({
    taskId,
    specPath: task.specPath,
    researchPath: (await fx.fs.exists(task.researchPath)) ? task.researchPath : undefined,
  });
  await runHeadless(ctx, taskId, "impl", {
    cwd,
    prompt,
    permissionMode: "auto",
    // Research and spec live in the main repo's .scratch/, outside the worktree.
    addDirs: [dirname(task.specPath)],
  });
  const prUrl = await fx.proc.prUrl(cwd);
  if (!prUrl) return fail(ctx, taskId, "the implementation didn't open a PR");
  await fx.store.update(taskId, (t) => {
    t.stages.impl.done = true;
    t.prUrl = prUrl;
  });
  return true;
}

// The session ID is recorded first so `flow <stage>` can resume the session afterwards.
async function runHeadless(
  ctx: Context,
  taskId: string,
  stage: SessionStage,
  launch: HeadlessLaunch,
): Promise<void> {
  const { fx } = ctx;
  const sessionId = randomUUID();
  await fx.store.update(taskId, (t) => {
    t.stages[stage].sessionId = sessionId;
  });
  const spinner = fx.log.spinner(`Running ${stage} headlessly (session ${sessionId})…`);
  const result = await fx.proc.claudeHeadless({ ...launch, sessionId });
  spinner.stop(result.exitCode === 0 ? `${stage} session ended` : `${stage} session failed`);
  const output = headlessResultText(result.stdout).trim() || result.stderr.trim();
  if (output) fx.log.message(output);
}

async function waitForSetup(ctx: Context, taskId: string): Promise<SetupGate> {
  const { fx } = ctx;
  let gate = setupGate(await loadTask(ctx, taskId), fx.proc.isAlive);
  if (gate.kind === "running")
    fx.log.info(`Waiting for the worktree setup (log: ${gate.logPath}).`);
  while (gate.kind === "running") {
    await fx.sleep(SETUP_POLL_MS);
    gate = setupGate(await loadTask(ctx, taskId), fx.proc.isAlive);
  }
  return gate;
}

async function fail(ctx: Context, taskId: string, reason: string): Promise<false> {
  ctx.fx.log.error(`AFK run stopped: ${reason}. Continue with \`flow\`.`);
  await ctx.fx.notify(notificationTitle(taskId), `AFK run stopped: ${reason}`);
  return false;
}
