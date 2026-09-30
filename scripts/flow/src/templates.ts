export interface TaskDetails {
  taskId: string;
  title: string;
  description: string;
}

const COMMENT = /<!--[\s\S]*?-->/g;

export function intakeTemplate(): string {
  return "<!-- Describe the signal: a bug, Slack thread, feature request or idea. URLs welcome. Leave empty to cancel. -->\n";
}

function taskHeader(task: TaskDetails): string[] {
  return [`# ${task.taskId}: ${task.title}`, "", task.description.trim() || "(no description)", ""];
}

export function researchTemplate(task: TaskDetails): string {
  return [
    ...taskHeader(task),
    "## Question",
    "",
    "<!-- What should the research answer? Leave blank to cancel. -->",
    "",
  ].join("\n");
}

export function solutionTemplate(task: TaskDetails, researchPath: string | undefined): string {
  return [
    ...taskHeader(task),
    ...(researchPath ? [`Research: ${researchPath}`, ""] : []),
    "## Proposed solution",
    "",
    "<!-- How do you want to solve it? This is what /grill-me will stress-test. Leave blank to cancel. -->",
    "",
  ].join("\n");
}

// Undefined means the user saved nothing beyond the template, which we treat as cancelling.
export function editorResult(template: string, edited: string): string | undefined {
  const strip = (text: string) => text.replace(COMMENT, "").trim();
  const result = strip(edited);
  return result && result !== strip(template) ? result : undefined;
}
