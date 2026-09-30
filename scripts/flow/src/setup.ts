import type { Effects } from "./effects.ts";
import { errorMessage } from "./errors.ts";

export interface SetupOutcome {
  status: "ready" | "failed";
  worktreePath?: string;
  error?: string;
}

// Printed by wta.sh: "Now in" right after the worktree is created, "Worktree ready at" once setup succeeded.
const READY = /Worktree ready at: (.+)$/gm;
const CREATED = /Now in: (.+)$/gm;

function lastMatch(text: string, pattern: RegExp): string | undefined {
  return [...text.matchAll(pattern)].at(-1)?.[1]?.trim();
}

function failureReason(log: string, exitCode: number): string {
  const lines = log
    .split("\n")
    .map((line) =>
      line
        .replaceAll("\u001b", "")
        .replace(/\[[0-9;]*m/g, "")
        .trim(),
    )
    .filter(Boolean);
  const explicit = lines.findLast((line) => line.includes("❌") || /^error\b/i.test(line));
  return (explicit ?? lines.at(-1) ?? `exited with code ${exitCode}`).replace("❌", "").trim();
}

export function setupOutcome(exitCode: number, log: string): SetupOutcome {
  const worktreePath = lastMatch(log, READY) ?? lastMatch(log, CREATED);
  if (exitCode !== 0) {
    return { status: "failed", worktreePath, error: failureReason(log, exitCode) };
  }
  if (!worktreePath) {
    return { status: "failed", error: "setup finished but the log has no worktree path" };
  }
  return { status: "ready", worktreePath };
}

export function setupNotification(
  taskId: string,
  outcome: SetupOutcome,
): { title: string; message: string } {
  const title = `flow · ${taskId}`;
  return outcome.status === "ready"
    ? { title, message: `Worktree ready: ${outcome.worktreePath}` }
    : { title, message: `Setup failed: ${outcome.error}` };
}

export async function runSetup(fx: Effects, taskId: string, pid: number): Promise<SetupOutcome> {
  const task = await fx.store.update(taskId, (t) => {
    if (t.setup) t.setup.pid = pid;
  });
  if (!task.setup) throw new Error(`${taskId} has no worktree setup to run`);
  const { logPath } = task.setup;

  const exitCode = await fx.proc.runWtap(taskId);
  const outcome = setupOutcome(exitCode, await fx.fs.readText(logPath).catch(() => ""));

  if (outcome.worktreePath) {
    try {
      await fx.proc.setPortTaskStatus(taskId, "In progress");
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
