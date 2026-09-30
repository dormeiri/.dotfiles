import { describe, expect, test } from "bun:test";
import {
  createTaskPrompt,
  grillPrompt,
  implementPrompt,
  researchPrompt,
  reviewPrompt,
} from "../src/stage-prompts.ts";
import {
  editorResult,
  intakeTemplate,
  researchTemplate,
  solutionTemplate,
} from "../src/templates.ts";

const TASK_URL = "https://app.getport.io/taskEntity?identifier=task_1";
const SPEC = "/repo/.scratch/task_1/spec.md";
const RESEARCH = "/repo/.scratch/task_1/research.md";

describe("stage prompts", () => {
  test("create-task passes the context to the skill", () => {
    expect(createTaskPrompt("Login breaks on Safari")).toBe("/create-task Login breaks on Safari");
  });

  test("research starts with the skill and names the task and output path", () => {
    const prompt = researchPrompt({ taskId: "task_1", question: "How?", researchPath: RESEARCH });
    expect(prompt.startsWith("/research How?")).toBe(true);
    expect(prompt).toContain(TASK_URL);
    expect(prompt).toContain(RESEARCH);
  });

  test("grill tells /to-spec where to write and which task to link", () => {
    const prompt = grillPrompt({ taskId: "task_1", solution: "Do X", specPath: SPEC });
    expect(prompt.startsWith("/grill-me Do X")).toBe(true);
    expect(prompt).toContain(`write the spec to ${SPEC}`);
    expect(prompt).toContain("link it to task task_1");
  });

  test("implement references the spec and ends with a draft PR", () => {
    const prompt = implementPrompt({ taskId: "task_1", specPath: SPEC });
    expect(prompt.startsWith(`/implement ${SPEC}`)).toBe(true);
    expect(prompt).toContain("gh pr create --draft");
    expect(prompt).toContain(TASK_URL);
    expect(prompt).not.toContain("Research:");
  });

  test("implement mentions research when there is some", () => {
    const prompt = implementPrompt({ taskId: "task_1", specPath: SPEC, researchPath: RESEARCH });
    expect(prompt).toContain(`Research: ${RESEARCH}`);
  });

  test("review diffs against the base, carries the spec and asks to push fixes", () => {
    const prompt = reviewPrompt({
      taskId: "task_1",
      specPath: SPEC,
      base: "abc123",
      prUrl: "https://github.com/o/r/pull/1",
    });
    expect(prompt.startsWith("/code-review abc123")).toBe(true);
    expect(prompt).toContain(SPEC);
    expect(prompt).toContain("PR: https://github.com/o/r/pull/1");
    expect(prompt).toContain("push it to this PR's branch");
  });
});

describe("editor templates", () => {
  const task = { taskId: "task_1", title: "Fix login", description: "It breaks." };

  test("research template has the task and a blank question", () => {
    const template = researchTemplate(task);
    expect(template).toContain("task_1: Fix login");
    expect(template).toContain("It breaks.");
    expect(template).toContain("## Question");
  });

  test("solution template links research only when present", () => {
    expect(solutionTemplate(task, RESEARCH)).toContain(`Research: ${RESEARCH}`);
    expect(solutionTemplate(task, undefined)).not.toContain("Research:");
    expect(solutionTemplate(task, undefined)).toContain("## Proposed solution");
  });

  test("an unedited template counts as cancelled", () => {
    const template = researchTemplate(task);
    expect(editorResult(template, template)).toBe(undefined);
    expect(editorResult(template, "")).toBe(undefined);
    expect(editorResult(intakeTemplate(), intakeTemplate())).toBe(undefined);
  });

  test("edited content is returned without the instruction comments", () => {
    const template = researchTemplate(task);
    const result = editorResult(template, `${template}Why does Safari drop the cookie?`);
    expect(result).toContain("Why does Safari drop the cookie?");
    expect(result).toContain("It breaks.");
    expect(result).not.toContain("<!--");
  });
});
