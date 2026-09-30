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

export function grillPrompt(input: { taskId: string; solution: string; specPath: string }): string {
  return [
    `/grill-me ${input.solution}`,
    "",
    taskLine(input.taskId),
    `When I run /to-spec, write the spec to ${input.specPath} and link it to task ${input.taskId}.`,
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
