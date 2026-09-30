// Tolerates markdown decoration around the marker, e.g. `**TASK_ID:** task_123` or `` `TASK_ID: task_123` ``.
const MARKER = /^[\s>*_`]*TASK_ID[*_`]*\s*:[\s*_`]*([\w-]+)/gm;

export function parseTaskIdMarker(output: string): string | undefined {
  return [...output.matchAll(MARKER)].at(-1)?.[1];
}

export function headlessResultText(stdout: string): string {
  try {
    const parsed: unknown = JSON.parse(stdout);
    if (typeof parsed === "object" && parsed !== null && "result" in parsed) {
      if (typeof parsed.result === "string") return parsed.result;
    }
  } catch {
    // Not JSON (e.g. Claude failed before producing a result); the raw output is still worth scanning.
  }
  return stdout;
}
