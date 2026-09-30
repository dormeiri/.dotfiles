import type { SessionStage, Stage, TaskState } from "./state.ts";

const REQUIRED: Stage[] = ["new", "spec", "impl", "review"];

export const STAGE_LABELS: Record<Stage, string> = {
  new: "Verify task & set up worktree",
  research: "Research (optional)",
  spec: "Spec",
  impl: "Implement",
  review: "Review",
};

export function nextStage(task: TaskState): Stage | undefined {
  return REQUIRED.find((stage) => !task.stages[stage].done);
}

export function runsInWorktree(stage: SessionStage): boolean {
  return stage === "impl" || stage === "review";
}

export function nextChoices(task: TaskState): Stage[] {
  const next = nextStage(task);
  if (!next) return [];
  if (next === "spec" && !task.stages.research.done) return ["research", "spec"];
  return [next];
}

export type SetupGate =
  | { kind: "not-started" }
  | { kind: "running"; logPath: string }
  | { kind: "ready"; worktreePath: string }
  | { kind: "failed"; logPath: string; reason?: string; worktreePath?: string };

export function setupGate(task: TaskState, isAlive: (pid: number) => boolean): SetupGate {
  const setup = task.setup;
  if (!setup) return { kind: "not-started" };
  const { logPath } = setup;
  const { worktreePath } = task;
  switch (setup.status) {
    case "running":
      // A runner killed by a reboot or crash never records its outcome, so it would look running forever.
      if (setup.pid !== undefined && !isAlive(setup.pid)) {
        return {
          kind: "failed",
          logPath,
          worktreePath,
          reason: "the setup runner exited without recording a result",
        };
      }
      return { kind: "running", logPath };
    case "ready":
      return worktreePath
        ? { kind: "ready", worktreePath }
        : { kind: "failed", logPath, reason: "no worktree path was recorded" };
    case "failed":
      return { kind: "failed", logPath, worktreePath, reason: setup.error };
  }
}

export function mainRepoWarning(branch: string | undefined): string | undefined {
  if (branch === "main") return undefined;
  const current = branch ? `on '${branch}'` : "on an unknown branch";
  return `The main repo is ${current}, not main, so this session will see that branch's code.`;
}
