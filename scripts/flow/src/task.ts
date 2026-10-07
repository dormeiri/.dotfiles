import { join } from "node:path";

export function artifactPaths(mainRepo: string, taskId: string) {
  const dir = join(mainRepo, ".scratch", taskId);
  return { researchPath: join(dir, "research.md"), specPath: join(dir, "spec.md") };
}
