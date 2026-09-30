import { describe, expect, test } from "bun:test";
import { myTaskChoice, parseMyTasks, sortMyTasks } from "../src/my-tasks.ts";

const task = (identifier: string, properties: Record<string, unknown> = {}) => ({
  identifier,
  title: `Title ${identifier}`,
  properties,
});

describe("parseMyTasks", () => {
  test("reads the entities of a search response", () => {
    const tasks = parseMyTasks({ ok: true, entities: [task("task_1", { status: null })] });
    expect(tasks.map((t) => t.identifier)).toEqual(["task_1"]);
  });

  test("treats a missing entity list as no tasks", () => {
    expect(parseMyTasks({ entities: null })).toEqual([]);
  });

  test("rejects a malformed response", () => {
    expect(() => parseMyTasks({ entities: [{ title: "no id" }] })).toThrow();
  });
});

describe("sortMyTasks", () => {
  test("orders by iteration end, then priority, status and size, missing values last", () => {
    const sorted = sortMyTasks([
      task("no_values"),
      task("next_iteration", { iteration_end_date: "2026-11-01", priority_order: 1 }),
      task("low_priority", { iteration_end_date: "2026-10-15", priority_order: 3 }),
      task("high_priority_big", {
        iteration_end_date: "2026-10-15",
        priority_order: 1,
        status_order: 1,
        expected_size_order: 4,
      }),
      task("high_priority_small", {
        iteration_end_date: "2026-10-15",
        priority_order: 1,
        status_order: 1,
        expected_size_order: 2,
      }),
    ]);
    expect(sorted.map((t) => t.identifier)).toEqual([
      "high_priority_small",
      "high_priority_big",
      "low_priority",
      "next_iteration",
      "no_values",
    ]);
  });
});

describe("myTaskChoice", () => {
  test("labels a task with priority initial, status, iteration and size", () => {
    const choice = myTaskChoice(
      task("task_1", {
        priority: "High",
        status: "In progress",
        iteration_status: "Current",
        expected_size: "M",
      }),
    );
    expect(choice).toEqual({
      value: "task_1",
      label: "[H] [In progress] [Current] [M] Title task_1",
      hint: "task_1",
    });
  });

  test("marks missing values", () => {
    expect(myTaskChoice({ identifier: "task_2", title: null, properties: null }).label).toBe(
      "[—] [—] [—] [—] Untitled",
    );
  });
});
