import type { CompanionStage } from "./state.ts";
import { taskUrl } from "./task.ts";

function taskLine(taskId: string): string {
  return `Task: ${taskId} (${taskUrl(taskId)})`;
}

export function createTaskPrompt(context: string): string {
  return `/create-task ${context}`;
}

export function describeTaskPrompt(taskId: string): string {
  return [
    "/update-task",
    "",
    taskLine(taskId),
    "This is an existing task and there's no conversation yet, so start from its current description: point out what's missing or unclear, explore the codebase where it helps, and suggest a new description.",
    "Iterate on it with me, and only update the task once I approve.",
  ].join("\n");
}

// Main-repo sessions aren't on the task's branch, so ADRs belong in the task's worktree.
function adrLine(worktree: string | undefined): string {
  return worktree
    ? `If you record an ADR, write it under the task's worktree, ${worktree}/docs/decisions/, numbered after the ADRs there, and commit it there; not in this repo, which isn't on the task's branch.`
    : "Don't write ADRs in this repo: it isn't on the task's branch and the task's worktree doesn't exist yet. If a decision needs one, say so, and I'll record it with `flow adr` once the worktree is ready.";
}

export function researchPrompt(input: {
  taskId: string;
  question: string;
  researchPath: string;
  worktree?: string;
}): string {
  return [
    `/research ${input.question}`,
    "",
    taskLine(input.taskId),
    `Save the findings to ${input.researchPath}`,
    adrLine(input.worktree),
  ].join("\n");
}

export function linkSpecCommand(taskId: string, specPath: string): string {
  return `port api call --method PATCH /blueprints/task/entities/${taskId} --data "$(jq -n --rawfile spec '${specPath}' '{properties: {spec: $spec}}')"`;
}

interface SpecInput {
  taskId: string;
  task: string;
  specPath: string;
  worktree?: string;
}

function writeSpecLines(input: SpecInput, when: string): string[] {
  return [
    `${when}, write the spec to ${input.specPath}, then link it to the task's \`spec\` property by running exactly:`,
    "",
    "```bash",
    linkSpecCommand(input.taskId, input.specPath),
    "```",
    "",
    "This repo isn't checked out on the task's branch, so don't infer the task from the branch name.",
    adrLine(input.worktree),
  ];
}

export function grillPrompt(input: SpecInput): string {
  return [
    `/grill-me ${input.task}`,
    "",
    taskLine(input.taskId),
    ...writeSpecLines(input, "When I run /to-spec"),
  ].join("\n");
}

export function afkSpecPrompt(input: SpecInput): string {
  return [
    `/to-spec ${input.task}`,
    "",
    taskLine(input.taskId),
    "I'm AFK, so don't ask me anything: wherever you'd check with me, decide yourself and list the decision under the spec's assumptions.",
    ...writeSpecLines(input, "When you're done"),
  ].join("\n");
}

export function implementPrompt(input: {
  taskId: string;
  specPath: string;
  researchPath?: string;
}): string {
  return [
    `/implement ${input.specPath}`,
    "",
    taskLine(input.taskId),
    ...(input.researchPath ? [`Research: ${input.researchPath}`] : []),
    "",
    "When the work is committed, push the branch and open a draft PR with `gh pr create --draft`.",
    `Link the task (${taskUrl(input.taskId)}) in the PR description.`,
  ].join("\n");
}

export function reviewPrompt(input: {
  taskId: string;
  specPath: string;
  base: string;
  prUrl?: string;
}): string {
  return [
    `/code-review ${input.base}`,
    "",
    `The fixed point is the merge-base with origin/main. Spec: ${input.specPath}`,
    taskLine(input.taskId),
    ...(input.prUrl ? [`PR: ${input.prUrl}`] : []),
    "",
    "After the review, stay in this session: I'll ask for fixes. Commit each fix and push it to this PR's branch.",
  ].join("\n");
}

export interface TaskContext {
  taskId: string;
  branch?: string;
  specPath?: string;
  researchPath?: string;
  prUrl?: string;
}

function contextLines(input: TaskContext): string[] {
  return [
    taskLine(input.taskId),
    ...(input.branch ? [`Branch: ${input.branch}`] : []),
    ...(input.specPath ? [`Spec: ${input.specPath}`] : []),
    ...(input.researchPath ? [`Research: ${input.researchPath}`] : []),
    ...(input.prUrl ? [`PR: ${input.prUrl}`] : []),
  ];
}

export interface CompanionContext {
  taskId: string;
  specPath?: string;
  prUrl?: string;
  implWorktree?: string;
}

const COMPANION_GOALS: Record<CompanionStage, string[]> = {
  docs: [
    "Document this task's user-facing change in port-docs.",
    "Follow CLAUDE.md and read best_practices.md before writing.",
  ],
  terraform: [
    "Add support for this task's change to the Port Terraform provider: schema, resources or data sources, examples and generated docs, with acceptance tests.",
  ],
};

export function companionPrompt(stage: CompanionStage, input: CompanionContext): string {
  return [
    ...COMPANION_GOALS[stage],
    "",
    taskLine(input.taskId),
    ...(input.specPath ? [`Spec: ${input.specPath}`] : []),
    ...(input.prUrl ? [`Implementation PR: ${input.prUrl} (see \`gh pr diff\`)`] : []),
    ...(input.implWorktree ? [`Implementation worktree (read-only): ${input.implWorktree}`] : []),
    "",
    "If nothing here needs to change, tell me and stop.",
    "When the work is committed, push the branch and open a draft PR with `gh pr create --draft`.",
    `Link the task (${taskUrl(input.taskId)})${input.prUrl ? " and the implementation PR" : ""} in the PR description.`,
  ].join("\n");
}

// Runs in the task's worktree.
export function announcementPrompt(input: TaskContext & { docsPrUrl?: string }): string {
  return [
    "/product-announcement",
    "",
    "Announce this task's user-facing change.",
    ...contextLines(input),
    ...(input.docsPrUrl ? [`Docs PR: ${input.docsPrUrl}`] : []),
    "",
    "If there's nothing user-facing to announce, tell me and stop.",
  ].join("\n");
}

export function freeSessionPrompt(input: TaskContext): string {
  return [
    ...contextLines(input),
    "",
    "This is context for a session about the task. Don't start working yet; reply briefly and wait for what I ask.",
  ].join("\n");
}

// Runs in the task's worktree.
export function adrPrompt(input: TaskContext & { decision: string }): string {
  return [
    `/significant-decision-making ${input.decision}`,
    "",
    ...contextLines(input),
    "",
    "Write the ADR under this repo's docs/decisions/, then commit it to the current branch.",
  ].join("\n");
}
