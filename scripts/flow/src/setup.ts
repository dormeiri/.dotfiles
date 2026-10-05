import { basename, join } from "node:path";
import type { Config } from "./config.ts";
import type { Effects, SetupStep } from "./effects.ts";
import { errorMessage } from "./errors.ts";

export interface SetupOutcome {
  status: "ready" | "failed";
  worktreePath?: string;
  error?: string;
}

export const AWS_PROFILE = "Local/DeveloperAccess";

export function worktreePath(config: Config, branch: string, repo = config.mainRepo): string {
  return join(config.worktreesDir, basename(repo), branch);
}

export function worktreeSteps(config: Config, branch: string, dir: string): SetupStep[] {
  return [
    { label: "Fetch origin/main", cmd: ["git", "fetch", "origin", "main"], cwd: config.mainRepo },
    {
      label: "Create the worktree",
      // --no-track: branching off origin/main would otherwise make `git push` target main.
      cmd: ["git", "worktree", "add", "--no-track", "-b", branch, dir, "origin/main"],
      cwd: config.mainRepo,
    },
  ];
}

// A companion repo needs no install step; an existing branch is reused so a retry keeps its commits.
export function companionWorktreeSteps(
  repo: string,
  branch: string,
  dir: string,
  branchExists: boolean,
): SetupStep[] {
  return [
    { label: "Fetch origin/main", cmd: ["git", "fetch", "origin", "main"], cwd: repo },
    {
      label: `Create the ${basename(repo)} worktree`,
      cmd: branchExists
        ? ["git", "worktree", "add", dir, branch]
        : ["git", "worktree", "add", "--no-track", "-b", branch, dir, "origin/main"],
      cwd: repo,
    },
  ];
}

export function monorepoSteps(config: Config, dir: string): SetupStep[] {
  const awsEnv = { AWS_PROFILE, GRANTED_ALIAS_CONFIGURED: "true" };
  return [
    {
      label: "Copy the frontend .env",
      cmd: ["cp", join(config.mainRepo, "apps/frontend/.env"), join(dir, "apps/frontend/")],
      cwd: dir,
      optional: true,
    },
    { label: "yarn install", cmd: ["yarn", "install"], cwd: dir },
    { label: "yarn pkg:build", cmd: ["yarn", "pkg:build"], cwd: dir },
    { label: `assume ${AWS_PROFILE}`, cmd: ["assume", AWS_PROFILE], cwd: dir, env: awsEnv },
    { label: "Pull middlewares", cmd: [config.pullMiddlewaresScript], cwd: dir, env: awsEnv },
  ];
}

export function notificationTitle(taskId: string): string {
  return `flow · ${taskId}`;
}

export function setupNotification(
  taskId: string,
  outcome: SetupOutcome,
): { title: string; message: string } {
  const title = notificationTitle(taskId);
  return outcome.status === "ready"
    ? { title, message: `Worktree ready: ${outcome.worktreePath}` }
    : { title, message: `Setup failed: ${outcome.error}` };
}

export async function runSteps(fx: Effects, steps: SetupStep[]): Promise<string | undefined> {
  for (const step of steps) {
    fx.log.info(`▶ ${step.label}`);
    const exitCode = await fx.proc.runStep(step);
    if (exitCode === 0) continue;
    if (step.optional) {
      fx.log.warn(`${step.label} failed (exit ${exitCode}), continuing`);
      continue;
    }
    return `${step.label} failed (exit ${exitCode})`;
  }
  return undefined;
}

async function createAndSetUp(fx: Effects, config: Config, taskId: string): Promise<SetupOutcome> {
  const branch = (await fx.proc.getPortTask(taskId)).branch;
  if (!branch) return { status: "failed", error: `${taskId} has no branch_name in Port` };
  await fx.store.update(taskId, (t) => {
    t.branch = branch;
  });
  if (await fx.git.branchExists(config.mainRepo, branch)) {
    return { status: "failed", error: `branch '${branch}' already exists locally` };
  }

  const dir = worktreePath(config, branch);
  const worktreeError = await runSteps(fx, worktreeSteps(config, branch, dir));
  if (worktreeError) return { status: "failed", error: worktreeError };
  const setupError = await runSteps(fx, monorepoSteps(config, dir));
  return setupError
    ? { status: "failed", worktreePath: dir, error: setupError }
    : { status: "ready", worktreePath: dir };
}

export async function runSetup(
  fx: Effects,
  config: Config,
  taskId: string,
  pid: number,
): Promise<SetupOutcome> {
  const task = await fx.store.update(taskId, (t) => {
    if (t.setup) t.setup.pid = pid;
  });
  if (!task.setup) throw new Error(`${taskId} has no worktree setup to run`);
  const { logPath } = task.setup;

  let outcome: SetupOutcome;
  try {
    outcome = await createAndSetUp(fx, config, taskId);
  } catch (error) {
    outcome = { status: "failed", error: errorMessage(error) };
  }
  if (outcome.error) fx.log.error(outcome.error);

  if (outcome.worktreePath) {
    try {
      await fx.proc.markPortTaskInProgress(taskId);
    } catch (error) {
      fx.log.warn(`Couldn't set ${taskId} to In progress: ${errorMessage(error)}`);
    }
  }
  await fx.store.update(taskId, (t) => {
    t.setup = { status: outcome.status, logPath, error: outcome.error };
    if (outcome.worktreePath) t.worktreePath = outcome.worktreePath;
  });
  const { title, message } = setupNotification(taskId, outcome);
  await fx.notify(title, message);
  return outcome;
}
