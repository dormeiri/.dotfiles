import { FOLLOW_UP_STAGES, type Stage, type TaskState } from "./state.ts";

const REQUIRED = ["new", "spec", "impl", "review"] as const satisfies Stage[];
export type RequiredStage = (typeof REQUIRED)[number];

export const STAGE_LABELS: Record<Stage, string> = {
  new: "Verify task & set up worktree",
  research: "Research (optional)",
  spec: "Spec",
  impl: "Implement",
  review: "Review",
  docs: "Docs PR in port-docs (optional)",
  terraform: "Terraform provider PR (optional)",
  announcement: "Send product announcement (optional)",
  done: "Done (set to Done in Port and archive)",
};

export function nextStage(task: TaskState): RequiredStage | undefined {
  return REQUIRED.find((stage) => !task.stages[stage].done);
}

export function nextChoices(task: TaskState): Stage[] {
  const next = nextStage(task);
  if (next === "spec" && !task.stages.research.done) return ["research", "spec"];
  const required: Stage[] = next ? [next] : task.stages.done.done ? [] : ["done"];
  if (!task.stages.impl.done) return required;
  return [...required, ...FOLLOW_UP_STAGES.filter((stage) => !task.stages[stage].done)];
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
