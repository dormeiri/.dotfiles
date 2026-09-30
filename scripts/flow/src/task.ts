import { join } from "node:path";

export function taskUrl(taskId: string): string {
  return `https://app.getport.io/taskEntity?identifier=${encodeURIComponent(taskId)}`;
}

export function artifactPaths(mainRepo: string, taskId: string) {
  const dir = join(mainRepo, ".scratch", taskId);
  return { researchPath: join(dir, "research.md"), specPath: join(dir, "spec.md") };
}
