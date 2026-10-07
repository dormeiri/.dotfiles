import { styleText } from "node:util";
import { describePr, type PrStatus, type TaskPrs } from "./pr.ts";
import {
  nextChoices,
  nextStage,
  type RequiredStage,
  type SetupGate,
  STAGE_LABELS,
} from "./stage-machine.ts";
import { COMPANION_STAGES, STAGES, type TaskState } from "./state.ts";

// Tasks are grouped by their next required stage, and as reviewed once none is left.
export type Phase = RequiredStage | "reviewed";

export const PHASE_LABELS: Record<Phase, string> = {
  new: "Verify & set up",
  spec: "Spec",
  impl: "Implement",
  review: "Review",
  reviewed: "Reviewed",
};

const PHASES = Object.keys(PHASE_LABELS) as Phase[];

export function groupByPhase(tasks: TaskState[]): { phase: Phase; tasks: TaskState[] }[] {
  return PHASES.map((phase) => ({
    phase,
    tasks: tasks.filter((task) => (nextStage(task) ?? "reviewed") === phase),
  })).filter((group) => group.tasks.length > 0);
}

export function describeNext(task: TaskState): string {
  const choices = nextChoices(task);
  return choices.length > 0 ? `next: ${choices.join(" or ")}` : "all stages done";
}

export function taskLabel(task: TaskState, pr: PrStatus | undefined): string {
  const badge = pr ? [`${styleText("dim", `PR #${pr.number}`)} ${describePr(pr)}`] : [];
  return [task.title, ...badge, styleText("dim", task.taskId)].join("  ");
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

function prLine(name: string, recorded: string | undefined, pr: PrStatus | undefined): string[] {
  const url = pr?.url ?? recorded;
  if (!url) return [];
  return [`${name}: ${pr ? `${describePr(pr)}  ` : ""}${styleText("dim", url)}`];
}

export function formatStatus(task: TaskState, gate: SetupGate, prs: TaskPrs = {}): string {
  const stages = STAGES.map((stage) => `${task.stages[stage].done ? "✔" : "·"} ${stage}`);
  const sessions = STAGES.flatMap((stage) => {
    const id = task.stages[stage].sessionId;
    return id ? [`  ${STAGE_LABELS[stage]}: ${id}`] : [];
  });
  return [
    `${styleText("bold", task.title)}  ${styleText("dim", task.taskId)}`,
    ...(task.branch ? [`branch: ${task.branch}`] : []),
    stages.join("  "),
    `setup: ${describeSetup(gate)}`,
    describeNext(task),
    ...prLine("PR", task.prUrl, prs.impl),
    ...COMPANION_STAGES.flatMap((stage) =>
      prLine(`${stage} PR`, task.stages[stage].prUrl, prs[stage]),
    ),
    ...(sessions.length > 0 ? ["sessions:", ...sessions] : []),
  ].join("\n");
}
