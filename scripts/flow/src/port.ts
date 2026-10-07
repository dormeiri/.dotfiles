import { z } from "zod";
import type { Context } from "./context.ts";
import type { Choice } from "./effects.ts";
import { errorMessage } from "./errors.ts";
import type { TaskState } from "./state.ts";
import type { TaskDetails } from "./templates.ts";

export function taskUrl(taskId: string): string {
  return `https://app.getport.io/taskEntity?identifier=${encodeURIComponent(taskId)}`;
}

export function taskIdFromBranch(branch: string | undefined): string | undefined {
  return branch?.match(/^(task_[^/]+)\//)?.[1];
}

export function taskEntityPath(taskId: string): string {
  return `/blueprints/task/entities/${taskId}`;
}

export function entitySearchPath(blueprint: string): string {
  return `/blueprints/${blueprint}/entities/search`;
}

export const IN_PROGRESS_PATCH = { properties: { status: "In progress" } };

export function linkSpecCommand(taskId: string, specPath: string): string {
  return `port api call --method PATCH ${taskEntityPath(taskId)} --data "$(jq -n --rawfile spec '${specPath}' '{properties: {spec: $spec}}')"`;
}

export interface PortTask {
  title: string;
  description: string;
  branch?: string;
}

const taskEntitySchema = z.object({
  title: z.string().nullish(),
  properties: z
    .object({ description: z.string().nullish(), branch_name: z.string().nullish() })
    .nullish(),
});

export function parsePortTask(taskId: string, raw: unknown): PortTask {
  const entity = taskEntitySchema.parse(raw);
  return {
    title: entity.title ?? taskId,
    description: entity.properties?.description ?? "",
    branch: entity.properties?.branch_name || undefined,
  };
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

export function currentIterationQuery(team: string) {
  return {
    include: ["$identifier", "$title"],
    limit: 1,
    query: {
      combinator: "and",
      rules: [
        { operator: "=", property: "iteration_status", value: "Current" },
        { operator: "containsAny", property: "$team", value: [team] },
      ],
    },
  };
}

const iterationSearchSchema = z.object({
  entities: z.array(z.object({ identifier: z.string(), title: z.string().nullish() })).nullish(),
});

export interface Iteration {
  identifier: string;
  title: string;
}

export function parseCurrentIteration(response: unknown): Iteration | undefined {
  const [found] = iterationSearchSchema.parse(response).entities ?? [];
  return found && { identifier: found.identifier, title: found.title ?? found.identifier };
}

// The tasks assigned to the calling user in the current or next iteration that aren't finished.
export const MY_TASKS_QUERY = {
  include: [
    "$identifier",
    "$title",
    "status",
    "priority",
    "iteration_status",
    "expected_size",
    "iteration_end_date",
    "priority_order",
    "status_order",
    "expected_size_order",
  ],
  limit: 50,
  query: {
    combinator: "and",
    rules: [
      {
        operator: "matchAny",
        property: { path: ["assignee"] },
        value: { context: "user", property: "$identifier" },
      },
      { operator: "in", property: "iteration_status", value: ["Current", "Next"] },
      { operator: "in", property: "status", value: ["Not started", "In progress", "In review"] },
    ],
  },
};

const text = z.string().nullish();
const order = z.number().nullish();

const myTaskSchema = z.object({
  identifier: z.string(),
  title: text,
  properties: z
    .object({
      status: text,
      priority: text,
      iteration_status: text,
      expected_size: text,
      iteration_end_date: text,
      priority_order: order,
      status_order: order,
      expected_size_order: order,
    })
    .nullish(),
});

export type MyTask = z.infer<typeof myTaskSchema>;

const myTasksSearchSchema = z.object({ entities: z.array(myTaskSchema).nullish() });

export function parseMyTasks(response: unknown): MyTask[] {
  return myTasksSearchSchema.parse(response).entities ?? [];
}

// Soonest iteration first, then priority, status and size; tasks missing a value sort last.
export function sortMyTasks(tasks: MyTask[]): MyTask[] {
  const keys = (task: MyTask) => {
    const p = task.properties;
    return [
      p?.iteration_end_date ?? "9999",
      p?.priority_order ?? 9999,
      p?.status_order ?? 9999,
      p?.expected_size_order ?? 9999,
    ] as const;
  };
  return [...tasks].sort((a, b) => {
    const [ka, kb] = [keys(a), keys(b)];
    if (ka[0] !== kb[0]) return ka[0].localeCompare(kb[0]);
    return ka[1] - kb[1] || ka[2] - kb[2] || ka[3] - kb[3];
  });
}

export function myTaskChoice(task: MyTask): Choice<string> {
  const p = task.properties;
  const tag = (value: string | null | undefined) => `[${value ?? "—"}]`;
  const priority = tag(p?.priority?.slice(0, 1));
  const label = `${priority} ${tag(p?.status)} ${tag(p?.iteration_status)} ${tag(p?.expected_size)} ${task.title ?? "Untitled"}`;
  return { value: task.identifier, label, hint: task.identifier };
}
