import type { TaskState } from "./state.ts";

export function taskIdFromBranch(branch: string | undefined): string | undefined {
  return branch?.match(/^(task_[^/]+)\//)?.[1];
}

export type Resolution =
  | { kind: "found"; taskId: string }
  | { kind: "unknown"; taskId: string }
  | { kind: "pick"; candidates: TaskState[] }
  | { kind: "none" };

export function resolveTask(
  explicit: string | undefined,
  branch: string | undefined,
  tasks: TaskState[],
): Resolution {
  if (explicit) {
    const tracked = tasks.some((task) => task.taskId === explicit);
    return { kind: tracked ? "found" : "unknown", taskId: explicit };
  }
  const inFlight = tasks.filter((task) => !task.archived);
  const inferred = taskIdFromBranch(branch);
  if (inferred && inFlight.some((task) => task.taskId === inferred)) {
    return { kind: "found", taskId: inferred };
  }
  return inFlight.length > 0 ? { kind: "pick", candidates: inFlight } : { kind: "none" };
}
