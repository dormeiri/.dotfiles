import type { Config } from "./config.ts";
import type { Effects } from "./effects.ts";
import type { TaskState } from "./state.ts";
import { notTracked } from "./store.ts";

export interface Context {
  fx: Effects;
  config: Config;
  cwd: string;
}

export async function loadTask(ctx: Context, taskId: string): Promise<TaskState> {
  const task = await ctx.fx.store.get(taskId);
  if (!task) throw notTracked(taskId);
  return task;
}
