import type { Config } from "./config.ts";
import type { Effects, PortTask } from "./effects.ts";
import { errorMessage } from "./errors.ts";
import type { TaskState } from "./state.ts";
import { notTracked } from "./store.ts";
import type { TaskDetails } from "./templates.ts";

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

export async function fetchPortTask(ctx: Context, taskId: string): Promise<PortTask | undefined> {
  try {
    return await ctx.fx.proc.getPortTask(taskId);
  } catch (error) {
    ctx.fx.log.warn(`Couldn't fetch ${taskId} from Port (${errorMessage(error)}).`);
    return undefined;
  }
}

// Always read fresh from Port: the user is told to fix wrong tasks there, not in flow.
export async function refreshTaskDetails(ctx: Context, task: TaskState): Promise<TaskDetails> {
  const { taskId } = task;
  const port = await fetchPortTask(ctx, taskId);
  if (!port) return { taskId, title: task.title, description: "" };
  await ctx.fx.store.update(taskId, (t) => {
    t.title = port.title;
    t.branch = port.branch ?? t.branch;
  });
  return { taskId, title: port.title, description: port.description };
}
