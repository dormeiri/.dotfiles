import { nextChoices, type SetupGate, STAGE_LABELS } from "./stage-machine.ts";
import { STAGES, type TaskState } from "./state.ts";

export function describeNext(task: TaskState): string {
  const choices = nextChoices(task);
  return choices.length > 0 ? `next: ${choices.join(" or ")}` : "all stages done";
}

function describeSetup(gate: SetupGate): string {
  switch (gate.kind) {
    case "not-started":
      return "not started";
    case "running":
      return `running (log: ${gate.logPath})`;
    case "ready":
      return `ready (${gate.worktreePath})`;
    case "failed":
      return `failed${gate.reason ? `: ${gate.reason}` : ""} (log: ${gate.logPath})`;
  }
}

export function formatStatus(task: TaskState, gate: SetupGate): string {
  const stages = STAGES.map((stage) => `${task.stages[stage].done ? "✔" : "·"} ${stage}`);
  const sessions = STAGES.flatMap((stage) => {
    const id = task.stages[stage].sessionId;
    return id ? [`  ${STAGE_LABELS[stage]}: ${id}`] : [];
  });
  return [
    `${task.taskId} · ${task.title}`,
    ...(task.branch ? [`branch: ${task.branch}`] : []),
    stages.join("  "),
    `setup: ${describeSetup(gate)}`,
    describeNext(task),
    ...(task.prUrl ? [`PR: ${task.prUrl}`] : []),
    ...(sessions.length > 0 ? ["sessions:", ...sessions] : []),
  ].join("\n");
}
