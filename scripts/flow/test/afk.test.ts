import { describe, expect, test } from "bun:test";
import { newCommand } from "../src/commands.ts";
import type { HeadlessLaunch } from "../src/effects.ts";
import { fakeContext, MAIN_REPO } from "./fakes.ts";

const SPEC = `${MAIN_REPO}/.scratch/task_1/spec.md`;
const WORKTREE = "/worktrees/port/task_1/slug";
const PR = "https://github.com/o/r/pull/1";

function afkFake(options: { writesSpec?: boolean; opensPr?: boolean; setupFails?: boolean } = {}) {
  const { writesSpec = true, opensPr = true, setupFails = false } = options;
  const headless: HeadlessLaunch[] = [];
  let prOpened = false;
  const fake = fakeContext({
    proc: {
      async claudeHeadless(launch) {
        headless.push(launch);
        if (launch.prompt.startsWith("/create-task")) {
          return { exitCode: 0, stdout: JSON.stringify({ result: "TASK_ID: task_1" }), stderr: "" };
        }
        if (launch.prompt.startsWith("/to-spec") && writesSpec) fake.files.add(SPEC);
        if (launch.prompt.startsWith("/implement") && opensPr) prOpened = true;
        return { exitCode: 0, stdout: JSON.stringify({ result: "ok" }), stderr: "" };
      },
      prUrl: async () => (prOpened ? PR : undefined),
    },
    // The background setup finishes while flow waits for it.
    async onSleep() {
      await fake.fx.store.update("task_1", (t) => {
        t.setup = setupFails
          ? { status: "failed", logPath: "/log", error: "yarn install failed (exit 1)" }
          : { status: "ready", logPath: "/log" };
        if (!setupFails) t.worktreePath = WORKTREE;
      });
    },
  });
  return { fake, headless };
}

describe("flow new --afk", () => {
  test("creates the task, specs it with /to-spec and implements it without any prompt", async () => {
    const { fake, headless } = afkFake();

    await newCommand(fake.ctx, "Login breaks on Safari", { afk: true });

    expect(fake.prompts).toEqual([]);
    expect(fake.editorTemplates).toEqual([]);
    expect(headless.map((h) => h.prompt.split(" ")[0])).toEqual([
      "/create-task",
      "/to-spec",
      "/implement",
    ]);
    const [, spec, impl] = headless;
    expect(spec).toMatchObject({ cwd: MAIN_REPO, permissionMode: "auto" });
    expect(spec?.prompt).toContain("Description of task_1");
    expect(spec?.prompt).toContain(`write the spec to ${SPEC}`);
    expect(spec?.prompt).not.toContain("/grill-me");
    expect(impl).toMatchObject({
      cwd: WORKTREE,
      permissionMode: "auto",
      addDirs: [`${MAIN_REPO}/.scratch/task_1`],
    });

    const task = await fake.task("task_1");
    expect(task.stages.new.done).toBe(true);
    expect(task.stages.spec).toEqual({ done: true, sessionId: spec?.sessionId });
    expect(task.stages.impl).toEqual({ done: true, sessionId: impl?.sessionId });
    expect(task.stages.review.done).toBe(false);
    expect(task.prUrl).toBe(PR);
    expect(fake.spawnedRunners).toHaveLength(1);
    expect(fake.notifications.at(-1)?.message).toContain(PR);
  });

  test("stops before implementing when no spec was written", async () => {
    const { fake, headless } = afkFake({ writesSpec: false });

    await newCommand(fake.ctx, "idea", { afk: true });

    expect(headless).toHaveLength(2);
    const task = await fake.task("task_1");
    expect(task.stages.spec.done).toBe(false);
    expect(task.stages.spec.sessionId).toBeDefined();
    expect(fake.notifications.at(-1)?.message).toContain("the spec wasn't written");
  });

  test("stops when the worktree setup fails", async () => {
    const { fake, headless } = afkFake({ setupFails: true });

    await newCommand(fake.ctx, "idea", { afk: true });

    expect(headless).toHaveLength(2);
    expect((await fake.task("task_1")).stages.spec.done).toBe(true);
    expect(fake.notifications.at(-1)?.message).toContain("yarn install failed");
  });

  test("leaves impl undone when no PR was opened", async () => {
    const { fake } = afkFake({ opensPr: false });

    await newCommand(fake.ctx, "idea", { afk: true });

    expect((await fake.task("task_1")).stages.impl.done).toBe(false);
    expect(fake.notifications.at(-1)?.message).toContain("didn't open a PR");
  });

  test("doesn't start anything when assume fails", async () => {
    const { fake, headless } = afkFake();
    fake.fx.proc.assume = async () => false;

    await newCommand(fake.ctx, "idea", { afk: true });

    expect(headless).toHaveLength(1);
    expect((await fake.task("task_1")).stages.new.done).toBe(false);
    expect(fake.spawnedRunners).toEqual([]);
  });
});
