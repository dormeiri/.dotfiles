import { describe, expect, test } from "bun:test";
import { resolveTask } from "../src/resolve.ts";
import { newTaskState, type TaskState } from "../src/state.ts";

function task(taskId: string, archived = false): TaskState {
  const state = newTaskState({
    taskId,
    title: taskId,
    researchPath: "/r",
    specPath: "/s",
    now: new Date(),
  });
  return { ...state, archived };
}

describe("resolveTask", () => {
  const tasks = [task("task_a"), task("task_b"), task("task_old", true)];

  test("an explicit ID wins over the branch", () => {
    expect(resolveTask("task_b", "task_a/slug", tasks)).toEqual({
      kind: "found",
      taskId: "task_b",
    });
  });

  test("an explicit ID that isn't tracked is reported", () => {
    expect(resolveTask("task_zzz", undefined, tasks)).toEqual({
      kind: "unknown",
      taskId: "task_zzz",
    });
  });

  test("infers the task from the current branch", () => {
    expect(resolveTask(undefined, "task_a/slug", tasks)).toEqual({
      kind: "found",
      taskId: "task_a",
    });
  });

  test("falls back to picking among in-flight tasks on a non-task branch", () => {
    const resolution = resolveTask(undefined, "main", tasks);
    expect(resolution.kind).toBe("pick");
    if (resolution.kind === "pick") {
      expect(resolution.candidates.map((t) => t.taskId)).toEqual(["task_a", "task_b"]);
    }
  });

  test("falls back to the picker when the branch's task is archived or untracked", () => {
    expect(resolveTask(undefined, "task_old/slug", tasks).kind).toBe("pick");
    expect(resolveTask(undefined, "task_new/slug", tasks).kind).toBe("pick");
  });

  test("reports when nothing is in flight", () => {
    expect(resolveTask(undefined, "main", [task("task_old", true)])).toEqual({ kind: "none" });
  });
});
