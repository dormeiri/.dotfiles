import { z } from "zod";
import type { Choice } from "./effects.ts";

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

const searchResultSchema = z.object({ entities: z.array(myTaskSchema).nullish() });

export function parseMyTasks(response: unknown): MyTask[] {
  return searchResultSchema.parse(response).entities ?? [];
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
