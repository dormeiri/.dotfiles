import type { AgentLaunch, HeadlessLaunch } from "../agent.ts";

// A CLI agent. Launches reach it with its own session IDs, not the router's.
export interface Harness {
  newSessionId(): Promise<string>;
  interactiveArgs(launch: AgentLaunch): string[];
  headlessArgs(launch: HeadlessLaunch): string[];
}

export function addDirArgs(dirs: string[]): string[] {
  return dirs.flatMap((dir) => ["--add-dir", dir]);
}

// Both CLIs print `{ "result": "<final reply>", ... }` with `--output-format json`.
export function resultText(stdout: string): string {
  try {
    const parsed: unknown = JSON.parse(stdout);
    if (typeof parsed === "object" && parsed !== null && "result" in parsed) {
      if (typeof parsed.result === "string") return parsed.result;
    }
  } catch {
    // Not JSON (e.g. the agent failed before producing a result); the raw output is still worth scanning.
  }
  return stdout;
}
