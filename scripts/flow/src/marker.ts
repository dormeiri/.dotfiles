// Agents sometimes decorate the line with markdown (`**TASK_ID:** task_1`) even when asked for plain text.
const MARKER = /^[\s>*_`]*TASK_ID[*_`]*\s*:[\s*_`]*([\w-]+)/gm;

export function parseTaskIdMarker(output: string): string | undefined {
  return [...output.matchAll(MARKER)].at(-1)?.[1];
}
