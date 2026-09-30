import { describe, expect, test } from "bun:test";
import { runSetup, setupNotification, setupOutcome } from "../src/setup.ts";
import { fakeContext } from "./fakes.ts";

const SUCCESS_LOG = [
  "Task ID: task_1",
  "📂 Now in: /wt/port/task_1/slug",
  "yarn install…",
  "🎉 Done! Worktree ready at: /wt/port/task_1/slug",
].join("\n");

const BRANCH_EXISTS_LOG = [
  "Task ID: task_1",
  "Branch: task_1/slug",
  "❌  Branch 'task_1/slug' already exists locally. Choose a different name.",
].join("\n");

const YARN_FAILED_LOG = [
  "📂 Now in: /wt/port/task_1/slug",
  "\u001b[31merror\u001b[39m Command failed with exit code 1.",
  "info Visit https://yarnpkg.com for documentation.",
].join("\n");

describe("setupOutcome", () => {
  test("success records the worktree path", () => {
    expect(setupOutcome(0, SUCCESS_LOG)).toEqual({
      status: "ready",
      worktreePath: "/wt/port/task_1/slug",
    });
  });

  test("an existing branch surfaces wt-create's error", () => {
    expect(setupOutcome(1, BRANCH_EXISTS_LOG)).toEqual({
      status: "failed",
      worktreePath: undefined,
      error: "Branch 'task_1/slug' already exists locally. Choose a different name.",
    });
  });

  test("a failure after the worktree was created keeps its path", () => {
    expect(setupOutcome(1, YARN_FAILED_LOG)).toEqual({
      status: "failed",
      worktreePath: "/wt/port/task_1/slug",
      error: "error Command failed with exit code 1.",
    });
  });

  test("a clean exit without a worktree path is a failure", () => {
    expect(setupOutcome(0, "nothing useful").status).toBe("failed");
  });

  test("an empty log still explains the failure", () => {
    expect(setupOutcome(2, "").error).toBe("exited with code 2");
  });
});

describe("setupNotification", () => {
  test("names the task and the outcome", () => {
    expect(setupNotification("task_1", { status: "ready", worktreePath: "/wt" })).toEqual({
      title: "flow · task_1",
      message: "Worktree ready: /wt",
    });
    expect(setupNotification("task_1", { status: "failed", error: "boom" }).message).toBe(
      "Setup failed: boom",
    );
  });
});

describe("runSetup", () => {
  async function running(log: string, exitCode: number, setStatus?: () => Promise<void>) {
    const statuses: string[] = [];
    const fake = fakeContext({
      proc: {
        runWtap: async () => exitCode,
        setPortTaskStatus:
          setStatus ??
          (async (_, status) => {
            statuses.push(status);
          }),
      },
    });
    await fake.seed("task_1", (t) => {
      t.stages.new.done = true;
      t.setup = { status: "running", logPath: "/logs/task_1.log" };
    });
    fake.texts.set("/logs/task_1.log", log);
    await runSetup(fake.fx, "task_1", 4242);
    return { fake, statuses };
  }

  test("success marks setup ready, records the worktree, sets In progress and notifies", async () => {
    const { fake, statuses } = await running(SUCCESS_LOG, 0);
    const task = await fake.task("task_1");
    expect(task.setup).toEqual({ status: "ready", logPath: "/logs/task_1.log" });
    expect(task.worktreePath).toBe("/wt/port/task_1/slug");
    expect(statuses).toEqual(["In progress"]);
    expect(fake.notifications).toEqual([
      { title: "flow · task_1", message: "Worktree ready: /wt/port/task_1/slug" },
    ]);
  });

  test("failure before the worktree exists records the error and leaves Port alone", async () => {
    const { fake, statuses } = await running(BRANCH_EXISTS_LOG, 1);
    const task = await fake.task("task_1");
    expect(task.setup?.status).toBe("failed");
    expect(task.setup?.error).toContain("already exists locally");
    expect(task.worktreePath).toBe(undefined);
    expect(statuses).toEqual([]);
    expect(fake.notifications[0]?.message).toContain("already exists locally");
  });

  test("failure after the worktree was created still sets In progress", async () => {
    const { fake, statuses } = await running(YARN_FAILED_LOG, 1);
    const task = await fake.task("task_1");
    expect(task.setup?.status).toBe("failed");
    expect(task.worktreePath).toBe("/wt/port/task_1/slug");
    expect(statuses).toEqual(["In progress"]);
  });

  test("a Port failure doesn't stop the setup from being recorded", async () => {
    const { fake } = await running(SUCCESS_LOG, 0, async () => {
      throw new Error("401");
    });
    expect((await fake.task("task_1")).setup?.status).toBe("ready");
    expect(fake.logged("warn")[0]).toContain("401");
    expect(fake.notifications).toHaveLength(1);
  });
});
