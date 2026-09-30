import { taskUrl } from "./task.ts";

function taskLine(taskId: string): string {
  return `Task: ${taskId} (${taskUrl(taskId)})`;
}

export function createTaskPrompt(context: string): string {
  return `/create-task ${context}`;
}

export function researchPrompt(input: {
  taskId: string;
  question: string;
  researchPath: string;
}): string {
  return [
    `/research ${input.question}`,
    "",
    taskLine(input.taskId),
    `Save the findings to ${input.researchPath}`,
  ].join("\n");
}

export function linkSpecCommand(taskId: string, specPath: string): string {
  return `port api call --method PATCH /blueprints/task/entities/${taskId} --data "$(jq -n --rawfile spec '${specPath}' '{properties: {spec: $spec}}')"`;
}

export function grillPrompt(input: { taskId: string; task: string; specPath: string }): string {
  return [
    `/grill-me ${input.task}`,
    "",
    taskLine(input.taskId),
    `When I run /to-spec, write the spec to ${input.specPath}, then link it to the task's \`spec\` property by running exactly:`,
    "",
    "```bash",
    linkSpecCommand(input.taskId, input.specPath),
    "```",
    "",
    "This repo isn't checked out on the task's branch, so don't infer the task from the branch name.",
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
