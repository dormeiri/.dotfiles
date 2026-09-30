import { describe, expect, test } from "bun:test";
import { mainRepoWarning } from "../src/session-stages.ts";
import { nextChoices, nextStage, setupGate } from "../src/stage-machine.ts";
import { newTaskState, type TaskState } from "../src/state.ts";

function task(change: (t: TaskState) => void = () => {}): TaskState {
  const state = newTaskState({
    taskId: "task_1",
    title: "T",
    researchPath: "/r",
    specPath: "/s",
    now: new Date(),
  });
  change(state);
  return state;
}

describe("nextStage / nextChoices", () => {
  test("a fresh task starts with verification", () => {
    expect(nextStage(task())).toBe("new");
    expect(nextChoices(task())).toEqual(["new"]);
  });

  test("after verification, research is offered alongside spec", () => {
    const t = task((t) => {
      t.stages.new.done = true;
    });
    expect(nextStage(t)).toBe("spec");
    expect(nextChoices(t)).toEqual(["research", "spec"]);
  });

  test("after research, only spec is offered", () => {
    const t = task((t) => {
      t.stages.new.done = true;
      t.stages.research.done = true;
    });
    expect(nextChoices(t)).toEqual(["spec"]);
  });

  test("research is never required once spec is done", () => {
    const t = task((t) => {
      t.stages.new.done = true;
      t.stages.spec.done = true;
    });
    expect(nextChoices(t)).toEqual(["impl"]);
  });

  test("impl leads to review, and a reviewed task has nothing next", () => {
    const t = task((t) => {
      t.stages.new.done = true;
      t.stages.spec.done = true;
      t.stages.impl.done = true;
    });
    expect(nextChoices(t)).toEqual(["review"]);
    t.stages.review.done = true;
    expect(nextStage(t)).toBe(undefined);
    expect(nextChoices(t)).toEqual([]);
  });
});

describe("setupGate", () => {
  const alive = () => true;
  const dead = () => false;

  test("not started without setup state", () => {
    expect(setupGate(task(), alive)).toEqual({ kind: "not-started" });
  });

  test("running while the runner is alive or hasn't recorded its pid yet", () => {
    const starting = task((t) => {
      t.setup = { status: "running", logPath: "/log" };
    });
    expect(setupGate(starting, dead)).toEqual({ kind: "running", logPath: "/log" });
    const running = task((t) => {
      t.setup = { status: "running", logPath: "/log", pid: 42 };
    });
    expect(setupGate(running, alive)).toEqual({ kind: "running", logPath: "/log" });
  });

  test("a running setup whose runner died counts as failed", () => {
    const t = task((t) => {
      t.setup = { status: "running", logPath: "/log", pid: 42 };
    });
    expect(setupGate(t, dead)).toMatchObject({ kind: "failed", logPath: "/log" });
  });

  test("ready exposes the worktree path", () => {
    const t = task((t) => {
      t.setup = { status: "ready", logPath: "/log" };
      t.worktreePath = "/wt";
    });
    expect(setupGate(t, alive)).toEqual({ kind: "ready", worktreePath: "/wt" });
  });

  test("failed carries the recorded reason", () => {
    const t = task((t) => {
      t.setup = { status: "failed", logPath: "/log", error: "Branch exists" };
    });
    expect(setupGate(t, alive)).toEqual({
      kind: "failed",
      logPath: "/log",
      reason: "Branch exists",
    });
  });
});

describe("mainRepoWarning", () => {
  test("no warning on main", () => {
    expect(mainRepoWarning("main")).toBe(undefined);
  });

  test("warns with the branch name otherwise", () => {
    expect(mainRepoWarning("task_9/other")).toContain("task_9/other");
    expect(mainRepoWarning(undefined)).toContain("unknown branch");
  });
});
