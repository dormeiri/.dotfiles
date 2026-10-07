import { describe, expect, test } from "bun:test";
import type { SetupStep } from "../src/effects.ts";
import {
  monorepoSteps,
  runSetup,
  setupNotification,
  worktreePath,
  worktreeSteps,
} from "../src/setup.ts";
import { type FakeOptions, fakeContext, MAIN_REPO } from "./fakes.ts";

const WORKTREE = "/worktrees/repo/task_1/slug";

describe("setup steps", () => {
  test("the worktree lands under the repo's name and the Port branch", () => {
    const { config } = fakeContext();
    expect(worktreePath(config, "task_1/slug")).toBe(WORKTREE);
  });

  test("the branch is created off origin/main without tracking it", () => {
    const { config } = fakeContext();
    expect(worktreeSteps(config, "task_1/slug", WORKTREE).map((s) => [s.cmd, s.cwd])).toEqual([
      [["git", "fetch", "origin", "main"], MAIN_REPO],
      [
        ["git", "worktree", "add", "--no-track", "-b", "task_1/slug", WORKTREE, "origin/main"],
        MAIN_REPO,
      ],
    ]);
  });

  test("monorepo setup runs in the worktree, with AWS auth for the middleware pull", () => {
    const { config } = fakeContext();
    const steps = monorepoSteps(config, WORKTREE);
    expect(steps.every((s) => s.cwd === WORKTREE)).toBe(true);
    expect(steps.map((s) => s.cmd[0])).toEqual([
      "cp",
      "yarn",
      "yarn",
      "assume",
      "/scripts/pull-middlewares.sh",
    ]);
    expect(steps[0]?.optional).toBe(true);
    expect(steps.at(-1)?.env?.AWS_PROFILE).toBe("Local/DeveloperAccess");
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
  async function run(options: FakeOptions & { failing?: string[] } = {}) {
    const ran: SetupStep[] = [];
    const inProgress: string[] = [];
    const fake = fakeContext({
      ...options,
      proc: {
        runStep: async (step) => {
          ran.push(step);
          return options.failing?.includes(step.label) ? 1 : 0;
        },
        setPortTaskStatus: async (taskId, status) => {
          if (status === "In progress") inProgress.push(taskId);
        },
        ...options.proc,
      },
    });
    await fake.seed("task_1", (t) => {
      t.stages.new.done = true;
      t.branch = undefined;
      t.setup = { status: "running", logPath: "/logs/task_1.log" };
    });
    const outcome = await runSetup(fake.fx, fake.config, "task_1", 4242);
    return {
      fake,
      ran: ran.map((s) => s.label),
      inProgress,
      outcome,
      task: await fake.task("task_1"),
    };
  }

  test("success runs every step, records the worktree and branch, sets In progress and notifies", async () => {
    const { fake, ran, inProgress, task } = await run();
    expect(ran).toEqual([
      "Fetch origin/main",
      "Create the worktree",
      "Copy the frontend .env",
      "yarn install",
      "yarn pkg:build",
      "assume Local/DeveloperAccess",
      "Pull middlewares",
    ]);
    expect(task.setup).toEqual({ status: "ready", logPath: "/logs/task_1.log" });
    expect(task.worktreePath).toBe(WORKTREE);
    expect(task.branch).toBe("task_1/slug");
    expect(inProgress).toEqual(["task_1"]);
    expect(fake.notifications).toEqual([
      { title: "flow · task_1", message: `Worktree ready: ${WORKTREE}` },
    ]);
  });

  test("an existing local branch fails before touching git", async () => {
    const { ran, inProgress, task, fake } = await run({ existingBranches: ["task_1/slug"] });
    expect(ran).toEqual([]);
    expect(task.setup?.status).toBe("failed");
    expect(task.setup?.error).toBe("branch 'task_1/slug' already exists locally");
    expect(task.worktreePath).toBe(undefined);
    expect(inProgress).toEqual([]);
    expect(fake.notifications[0]?.message).toContain("already exists locally");
  });

  test("a task without a branch_name fails", async () => {
    const { ran, task } = await run({
      proc: { getPortTask: async () => ({ title: "T", description: "" }) },
    });
    expect(ran).toEqual([]);
    expect(task.setup?.error).toBe("task_1 has no branch_name in Port");
  });

  test("Port being unreachable fails the setup instead of crashing", async () => {
    const { task } = await run({
      proc: {
        getPortTask: async () => {
          throw new Error("401");
        },
      },
    });
    expect(task.setup).toMatchObject({ status: "failed", error: "401" });
  });

  test("a failed worktree creation stops before setup and leaves Port alone", async () => {
    const { ran, inProgress, task } = await run({ failing: ["Create the worktree"] });
    expect(ran).toEqual(["Fetch origin/main", "Create the worktree"]);
    expect(task.setup?.error).toBe("Create the worktree failed (exit 1)");
    expect(task.worktreePath).toBe(undefined);
    expect(inProgress).toEqual([]);
  });

  test("a failed setup step keeps the worktree and still sets In progress", async () => {
    const { ran, inProgress, task } = await run({ failing: ["yarn install"] });
    expect(ran.at(-1)).toBe("yarn install");
    expect(task.setup?.status).toBe("failed");
    expect(task.setup?.error).toBe("yarn install failed (exit 1)");
    expect(task.worktreePath).toBe(WORKTREE);
    expect(inProgress).toEqual(["task_1"]);
  });

  test("a missing frontend .env doesn't fail the setup", async () => {
    const { ran, task } = await run({ failing: ["Copy the frontend .env"] });
    expect(ran).toContain("Pull middlewares");
    expect(task.setup?.status).toBe("ready");
  });

  test("a Port failure doesn't stop the setup from being recorded", async () => {
    const { fake, task } = await run({
      proc: {
        setPortTaskStatus: async () => {
          throw new Error("401");
        },
      },
    });
    expect(task.setup?.status).toBe("ready");
    expect(fake.logged("warn")[0]).toContain("401");
    expect(fake.notifications).toHaveLength(1);
  });
});
