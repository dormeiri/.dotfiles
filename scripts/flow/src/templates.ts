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

// The task's Solution Overview was already approved at verification, so it's the starting point as-is.
export function specTemplate(task: TaskDetails, researchPath: string | undefined): string {
  return [
    "<!-- This is what /grill-me will stress-test. Edit it if needed; empty it to cancel. -->",
    ...taskHeader(task),
    ...(researchPath ? [`Research: ${researchPath}`, ""] : []),
  ].join("\n");
}

function stripComments(text: string): string {
  return text.replace(COMMENT, "").trim();
}

// Undefined means the user emptied the editor, which we treat as cancelling.
export function editedText(edited: string): string | undefined {
  return stripComments(edited) || undefined;
}

// Undefined means the user saved nothing beyond the template, which we treat as cancelling.
export function editorResult(template: string, edited: string): string | undefined {
  const result = editedText(edited);
  return result !== stripComments(template) ? result : undefined;
}
