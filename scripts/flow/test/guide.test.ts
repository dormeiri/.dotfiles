import { describe, expect, test } from "bun:test";
import {
  archiveCommand,
  CREATE_TASK_TOOLS,
  homeCommand,
  newCommand,
  openCommand,
  stageCommand,
  statusCommand,
} from "../src/commands.ts";
import type { TaskState } from "../src/state.ts";
import { fakeContext, MAIN_REPO, readyWorktree } from "./fakes.ts";

const RESEARCH = `${MAIN_REPO}/.scratch/task_1/research.md`;
const SPEC = `${MAIN_REPO}/.scratch/task_1/spec.md`;
const WORKTREE = "/worktrees/port/task_1/slug";

const createdTask = (taskId: string) => ({
  claudeHeadless: async () => ({
    exitCode: 0,
    stdout: JSON.stringify({ result: `✅ Done!\nTASK_ID: ${taskId}` }),
    stderr: "",
  }),
});

describe("flow new", () => {
  test("creates the task headlessly, verifies it, starts setup and offers research or spec", async () => {
    const headless: { cwd: string; prompt: string; allowedTools: string[] }[] = [];
    const opened: string[] = [];
    const fake = fakeContext({
      answers: [true, "later"],
      proc: {
        async claudeHeadless(opts) {
          headless.push(opts);
          return createdTask("task_1").claudeHeadless();
        },
        openUrl: async (url) => {
          opened.push(url);
        },
      },
    });

    await newCommand(fake.ctx, "Login breaks on Safari");

    expect(headless).toEqual([
      {
        cwd: MAIN_REPO,
        prompt: "/create-task Login breaks on Safari",
        allowedTools: CREATE_TASK_TOOLS,
      },
    ]);
    expect(opened).toEqual(["https://app.getport.io/taskEntity?identifier=task_1"]);
    const task = await fake.task("task_1");
    expect(task.title).toBe("Title of task_1");
    expect(task.branch).toBe("task_1/slug");
    expect(task.stages.new.done).toBe(true);
    expect(task.setup?.status).toBe("running");
    expect(fake.spawnedRunners).toEqual([{ taskId: "task_1", logPath: task.setup?.logPath ?? "" }]);
    expect(fake.prompts.map((p) => [p.kind, p.options])).toEqual([
      ["confirm", []],
      ["select", ["research", "spec", "later"]],
    ]);
  });

  test("only allows the Port MCP connector and the port CLI in the headless run", () => {
    expect(CREATE_TASK_TOOLS).toContain("mcp__claude_ai_Port_IO");
    expect(CREATE_TASK_TOOLS).toContain("Bash(port:*)");
    expect(CREATE_TASK_TOOLS.every((tool) => /port/i.test(tool))).toBe(true);
  });

  test("opens the editor when no input is given and stops if nothing was written", async () => {
    let headlessRuns = 0;
    const fake = fakeContext({
      proc: {
        claudeHeadless: async () => {
          headlessRuns++;
          return { exitCode: 0, stdout: "", stderr: "" };
        },
      },
    });

    await newCommand(fake.ctx, "");

    expect(fake.editorTemplates).toHaveLength(1);
    expect(headlessRuns).toBe(0);
    expect(await fake.fx.store.list()).toEqual([]);
  });

  test("without a marker, shows Claude's output and falls back to the task picker", async () => {
    const fake = fakeContext({
      answers: ["task_picked", false],
      proc: {
        claudeHeadless: async () => ({
          exitCode: 0,
          stdout: JSON.stringify({ result: "Created it, see link" }),
          stderr: "",
        }),
        searchPortTasks: async () => ({
          entities: [{ identifier: "task_picked", title: "Picked" }],
        }),
      },
    });

    await newCommand(fake.ctx, "idea");

    expect(fake.logged("message")).toContain("Created it, see link");
    expect(fake.prompts[0]).toMatchObject({ kind: "filterSelect", options: ["task_picked"] });
    expect((await fake.task("task_picked")).taskId).toBe("task_picked");
  });

  test("without a marker and without open tasks, nothing is tracked", async () => {
    const fake = fakeContext({
      proc: { claudeHeadless: async () => ({ exitCode: 1, stdout: "", stderr: "boom" }) },
    });

    await newCommand(fake.ctx, "idea");

    expect(fake.logged("message")).toContain("boom");
    expect(await fake.fx.store.list()).toEqual([]);
  });

  test("a rejected task stays tracked without a worktree and resumes at verification", async () => {
    const fake = fakeContext({ answers: [false], proc: createdTask("task_1") });
    await newCommand(fake.ctx, "x");

    const task = await fake.task("task_1");
    expect(task.stages.new.done).toBe(false);
    expect(task.setup).toBe(undefined);
    expect(fake.spawnedRunners).toEqual([]);
    expect(fake.logged("info").some((m) => m.includes("Fix it in Port"))).toBe(true);
  });

  test("doesn't start setup when assume fails", async () => {
    const fake = fakeContext({
      answers: [true],
      proc: { ...createdTask("task_1"), assume: async () => false },
    });

    await newCommand(fake.ctx, "x");

    expect(fake.spawnedRunners).toEqual([]);
    expect((await fake.task("task_1")).stages.new.done).toBe(false);
  });
});

describe("research and spec", () => {
  test("research runs in the main repo from the edited question and completes when the file exists", async () => {
    const fake = fakeContext({
      answers: [false],
      branches: { [MAIN_REPO]: "main" },
      proc: { editText: async (template) => `${template}Why does Safari drop the cookie?` },
      onSession: () => {
        fake.files.add(RESEARCH);
      },
    });
    await fake.seed("task_1", (t) => {
      t.stages.new.done = true;
    });

    await stageCommand(fake.ctx, "research", "task_1");

    const [launch] = fake.launches;
    expect(launch?.cwd).toBe(MAIN_REPO);
    expect(launch?.session.kind).toBe("fresh");
    if (launch?.session.kind === "fresh") {
      expect(launch.session.prompt.startsWith("/research # task_1: Title of task_1")).toBe(true);
      expect(launch.session.prompt).toContain("Why does Safari drop the cookie?");
      expect(launch.session.prompt).toContain(RESEARCH);
    }
    const task = await fake.task("task_1");
    expect(task.stages.research.done).toBe(true);
    expect(task.stages.research.sessionId).toBe(
      launch?.session.kind === "fresh" ? launch.session.id : "",
    );
    expect(fake.prompts.map((p) => p.message)).toEqual(["Continue to Spec?"]);
    expect(fake.logged("warn")).toEqual([]);
  });

  test("warns when the main repo isn't on main, without switching", async () => {
    const fake = fakeContext({
      answers: [false],
      branches: { [MAIN_REPO]: "task_9/other" },
      proc: { editText: async (template) => `${template}question` },
      onSession: () => {
        fake.files.add(RESEARCH);
      },
    });
    await fake.seed("task_1", (t) => {
      t.stages.new.done = true;
    });

    await stageCommand(fake.ctx, "research", "task_1");

    expect(fake.logged("warn")[0]).toContain("task_9/other");
    expect(fake.launches).toHaveLength(1);
  });

  test("spec grills the task description as-is when the editor is saved unchanged", async () => {
    const fake = fakeContext({
      answers: [false],
      branches: { [MAIN_REPO]: "main" },
      onSession: () => {
        fake.files.add(SPEC);
      },
    });
    await fake.seed("task_1", (t) => {
      t.stages.new.done = true;
    });

    await stageCommand(fake.ctx, "spec", "task_1");

    expect(fake.editorTemplates[0]).toContain("Description of task_1");
    const session = fake.launches[0]?.session;
    expect(session?.kind === "fresh" && session.prompt).toStartWith(
      "/grill-me # task_1: Title of task_1",
    );
    expect(session?.kind === "fresh" && session.prompt).toContain("Description of task_1");
    expect(session?.kind === "fresh" && session.prompt).toContain("--rawfile spec");
    expect((await fake.task("task_1")).stages.spec.done).toBe(true);
  });

  test("emptying the editor launches nothing", async () => {
    const fake = fakeContext({
      branches: { [MAIN_REPO]: "main" },
      proc: { editText: async () => "" },
    });
    await fake.seed("task_1", (t) => {
      t.stages.new.done = true;
    });

    await stageCommand(fake.ctx, "spec", "task_1");

    expect(fake.launches).toEqual([]);
    expect((await fake.task("task_1")).stages.spec.sessionId).toBe(undefined);
  });

  test("spec's editor template links existing research and the grill prompt names the spec path", async () => {
    const fake = fakeContext({
      answers: [false],
      files: [RESEARCH],
      branches: { [MAIN_REPO]: "main" },
      proc: { editText: async (template) => `${template}Use a cookie jar` },
      onSession: () => {
        fake.files.add(SPEC);
      },
    });
    await fake.seed("task_1", (t) => {
      t.stages.new.done = true;
      t.stages.research.done = true;
    });

    await stageCommand(fake.ctx, "spec", "task_1");

    const session = fake.launches[0]?.session;
    expect(session?.kind === "fresh" && session.prompt.startsWith("/grill-me ")).toBe(true);
    expect(session?.kind === "fresh" && session.prompt).toContain(`Research: ${RESEARCH}`);
    expect(session?.kind === "fresh" && session.prompt).toContain(`write the spec to ${SPEC}`);
    expect((await fake.task("task_1")).stages.spec.done).toBe(true);
    expect(fake.prompts.map((p) => p.message)).toEqual(["Continue to Implement?"]);
  });

  describe("when the stage produced no output", () => {
    async function missingSpec(answers: (string | boolean)[]) {
      const fake = fakeContext({
        answers,
        branches: { [MAIN_REPO]: "main" },
        proc: { editText: async (template) => `${template}solution` },
      });
      await fake.seed("task_1", (t) => {
        t.stages.new.done = true;
      });
      await stageCommand(fake.ctx, "spec", "task_1");
      return fake;
    }

    test("offers retry, mark done or leave", async () => {
      const fake = await missingSpec(["leave"]);
      expect(fake.prompts[0]?.options).toEqual(["retry", "done", "leave"]);
      expect(fake.logged("warn")[0]).toContain(SPEC);
    });

    test("leaving keeps the stage pending and exits", async () => {
      const fake = await missingSpec(["leave"]);
      expect((await fake.task("task_1")).stages.spec.done).toBe(false);
      expect(fake.remainingAnswers).toEqual([]);
    });

    test("marking done overrides the check and moves on", async () => {
      const fake = await missingSpec(["done", false]);
      expect((await fake.task("task_1")).stages.spec.done).toBe(true);
      expect(fake.prompts.at(-1)?.message).toBe("Continue to Implement?");
    });

    test("retrying relaunches, offering to resume the previous session", async () => {
      const fake = await missingSpec(["retry", "resume", "leave"]);
      const [first, second] = fake.launches;
      expect(second?.session).toEqual({
        kind: "resume",
        id: first?.session.id ?? "",
      });
      expect(fake.prompts.map((p) => p.options)).toEqual([
        ["retry", "done", "leave"],
        ["resume", "fresh"],
        ["retry", "done", "leave"],
      ]);
    });
  });
});

describe("resuming a stage", () => {
  const PREVIOUS = "11111111-1111-4111-8111-111111111111";

  async function withPreviousSession(answer: string) {
    const fake = fakeContext({
      answers: [answer, "leave"],
      branches: { [MAIN_REPO]: "main" },
      proc: { editText: async (template) => `${template}new idea` },
    });
    await fake.seed("task_1", (t) => {
      t.stages.new.done = true;
      t.stages.spec.sessionId = PREVIOUS;
    });
    await stageCommand(fake.ctx, "spec", "task_1");
    return fake;
  }

  test("resume reopens the recorded session without the editor", async () => {
    const fake = await withPreviousSession("resume");
    expect(fake.launches[0]?.session).toEqual({ kind: "resume", id: PREVIOUS });
    expect(fake.editorTemplates).toEqual([]);
    expect((await fake.task("task_1")).stages.spec.sessionId).toBe(PREVIOUS);
  });

  test("fresh starts and records a new session", async () => {
    const fake = await withPreviousSession("fresh");
    const session = fake.launches[0]?.session;
    expect(session?.kind).toBe("fresh");
    expect(session?.id).not.toBe(PREVIOUS);
    expect((await fake.task("task_1")).stages.spec.sessionId).toBe(session?.id);
  });
});

describe("implement", () => {
  test("runs in the worktree in auto mode, with the spec, and records the PR", async () => {
    const fake = fakeContext({
      answers: [false],
      files: [SPEC],
      proc: {
        prUrl: async (cwd) => (cwd === WORKTREE ? "https://github.com/o/r/pull/7" : undefined),
      },
    });
    await fake.seed("task_1", readyWorktree);

    await stageCommand(fake.ctx, "impl", "task_1");

    const [launch] = fake.launches;
    expect(launch?.cwd).toBe(WORKTREE);
    expect(launch?.permissionMode).toBe("auto");
    expect(launch?.addDirs).toEqual([`${MAIN_REPO}/.scratch/task_1`]);
    expect(launch?.session.kind === "fresh" && launch.session.prompt).toStartWith(
      `/implement ${SPEC}`,
    );
    const task = await fake.task("task_1");
    expect(task.stages.impl.done).toBe(true);
    expect(task.prUrl).toBe("https://github.com/o/r/pull/7");
    expect(fake.prompts.map((p) => p.message)).toEqual(["Continue to Review?"]);
  });

  test("asks before implementing without a spec file", async () => {
    const fake = fakeContext({ answers: [false] });
    await fake.seed("task_1", readyWorktree);

    await stageCommand(fake.ctx, "impl", "task_1");

    expect(fake.prompts[0]?.message).toContain(SPEC);
    expect(fake.launches).toEqual([]);
  });

  test("implements without a spec file when the user insists", async () => {
    const fake = fakeContext({ answers: [true, "leave"] });
    await fake.seed("task_1", readyWorktree);

    await stageCommand(fake.ctx, "impl", "task_1");

    expect(fake.launches).toHaveLength(1);
  });

  test("while setup is running, exiting launches nothing", async () => {
    const fake = fakeContext({ answers: ["exit"], files: [SPEC] });
    await fake.seed("task_1", (t) => {
      readyWorktree(t);
      t.setup = { status: "running", logPath: "/logs/task_1.log" };
    });

    await stageCommand(fake.ctx, "impl", "task_1");

    expect(fake.prompts[0]?.options).toEqual(["wait", "exit"]);
    expect(fake.launches).toEqual([]);
  });

  test("waiting tails the log until setup is ready, then implements", async () => {
    const tailed: string[] = [];
    let stopped = false;
    const fake = fakeContext({
      answers: ["wait", false],
      files: [SPEC],
      proc: {
        tailLog: (path) => {
          tailed.push(path);
          return {
            stop() {
              stopped = true;
            },
          };
        },
        prUrl: async () => "https://github.com/o/r/pull/7",
      },
      onSleep: () =>
        fake.fx.store
          .update("task_1", (t) => {
            t.setup = { status: "ready", logPath: "/logs/task_1.log" };
          })
          .then(() => {}),
    });
    await fake.seed("task_1", (t) => {
      readyWorktree(t);
      t.setup = { status: "running", logPath: "/logs/task_1.log" };
    });

    await stageCommand(fake.ctx, "impl", "task_1");

    expect(tailed).toEqual(["/logs/task_1.log"]);
    expect(stopped).toBe(true);
    expect(fake.launches[0]?.cwd).toBe(WORKTREE);
  });

  const failedBeforeWorktree = (t: TaskState) => {
    readyWorktree(t);
    t.worktreePath = undefined;
    t.setup = { status: "failed", logPath: "/logs/task_1.log", error: "Branch exists" };
  };

  test("a failed setup is reported with its reason and log path", async () => {
    const fake = fakeContext({ answers: ["exit"], files: [SPEC] });
    await fake.seed("task_1", failedBeforeWorktree);

    await stageCommand(fake.ctx, "impl", "task_1");

    expect(fake.logged("error")[0]).toContain("Branch exists");
    expect(fake.logged("error")[0]).toContain("/logs/task_1.log");
    expect(fake.prompts[0]?.options).toEqual(["retry", "exit"]);
    expect(fake.launches).toEqual([]);
  });

  test("retrying a failed setup restarts it in the background", async () => {
    const fake = fakeContext({ answers: ["retry", "exit"], files: [SPEC] });
    await fake.seed("task_1", failedBeforeWorktree);

    await stageCommand(fake.ctx, "impl", "task_1");

    expect(fake.spawnedRunners.map((r) => r.taskId)).toEqual(["task_1"]);
    expect((await fake.task("task_1")).setup?.status).toBe("running");
    expect(fake.prompts.map((p) => p.options)).toEqual([
      ["retry", "exit"],
      ["wait", "exit"],
    ]);
  });

  test("a setup whose runner died is treated as failed", async () => {
    const fake = fakeContext({ answers: ["exit"], files: [SPEC], proc: { isAlive: () => false } });
    await fake.seed("task_1", (t) => {
      readyWorktree(t);
      t.setup = { status: "running", logPath: "/logs/task_1.log", pid: 99 };
    });

    await stageCommand(fake.ctx, "impl", "task_1");

    expect(fake.prompts[0]?.options).toEqual(["fixed", "retry", "exit"]);
  });

  test("a setup that failed after creating the worktree can be fixed in place", async () => {
    const fake = fakeContext({ answers: ["fixed", "leave"], files: [SPEC] });
    await fake.seed("task_1", (t) => {
      readyWorktree(t);
      t.setup = { status: "failed", logPath: "/logs/task_1.log", error: "yarn failed" };
    });

    await stageCommand(fake.ctx, "impl", "task_1");

    expect(fake.prompts[0]?.options).toEqual(["fixed", "retry", "exit"]);
    expect((await fake.task("task_1")).setup?.status).toBe("ready");
    expect(fake.spawnedRunners).toEqual([]);
    expect(fake.launches[0]?.cwd).toBe(WORKTREE);
  });

  test("no PR after the session offers recovery", async () => {
    const fake = fakeContext({ answers: ["leave"], files: [SPEC] });
    await fake.seed("task_1", readyWorktree);

    await stageCommand(fake.ctx, "impl", "task_1");

    expect(fake.logged("warn")[0]).toContain("a PR for this branch");
    expect((await fake.task("task_1")).stages.impl.done).toBe(false);
  });
});

describe("review", () => {
  test("reviews against the merge-base in the worktree and completes on confirmation", async () => {
    const fake = fakeContext({ answers: [true] });
    await fake.seed("task_1", (t) => {
      readyWorktree(t);
      t.stages.impl.done = true;
      t.prUrl = "https://github.com/o/r/pull/7";
    });

    await stageCommand(fake.ctx, "review", "task_1");

    const session = fake.launches[0]?.session;
    expect(fake.launches[0]?.cwd).toBe(WORKTREE);
    expect(fake.launches[0]?.permissionMode).toBe(undefined);
    expect(session?.kind === "fresh" && session.prompt).toStartWith("/code-review abc123");
    expect(session?.kind === "fresh" && session.prompt).toContain(SPEC);
    expect((await fake.task("task_1")).stages.review.done).toBe(true);
    expect(fake.logged("success").at(-1)).toContain("flow archive task_1");
  });

  test("declining the confirmation leaves the review open", async () => {
    const fake = fakeContext({ answers: [false] });
    await fake.seed("task_1", (t) => {
      readyWorktree(t);
      t.stages.impl.done = true;
    });

    await stageCommand(fake.ctx, "review", "task_1");

    expect((await fake.task("task_1")).stages.review.done).toBe(false);
  });
});

describe("picking the task", () => {
  test("infers the task from the current worktree branch", async () => {
    const fake = fakeContext({
      answers: [false],
      cwd: WORKTREE,
      branches: { [WORKTREE]: "task_1/slug" },
    });
    await fake.seed("task_1", (t) => {
      readyWorktree(t);
      t.stages.impl.done = true;
    });
    await fake.seed("task_2");

    await stageCommand(fake.ctx, "review", undefined);

    expect(fake.launches[0]?.cwd).toBe(WORKTREE);
    expect(fake.prompts.map((p) => p.kind)).toEqual(["confirm"]);
  });

  test("falls back to a picker of in-flight tasks", async () => {
    const fake = fakeContext({ answers: [undefined], branches: { "/somewhere": "main" } });
    await fake.seed("task_1");
    await fake.seed("task_2");
    await fake.seed("task_old", (t) => {
      t.archived = true;
    });

    await stageCommand(fake.ctx, "review", undefined);

    expect(fake.prompts[0]).toMatchObject({ kind: "filterSelect", options: ["task_1", "task_2"] });
    expect(fake.launches).toEqual([]);
  });

  test("an untracked explicit ID is an error", async () => {
    const fake = fakeContext();
    await expect(stageCommand(fake.ctx, "spec", "task_nope")).rejects.toThrow(/isn't tracked/);
  });
});

describe("flow with no arguments", () => {
  test("offers in-flight tasks and runs the picked task's next stage without asking again", async () => {
    const fake = fakeContext({ answers: ["task_1", false], files: [SPEC] });
    await fake.seed("task_1", readyWorktree);
    await fake.seed("task_old", (t) => {
      t.archived = true;
    });

    await homeCommand(fake.ctx);

    expect(fake.prompts[0]).toMatchObject({ kind: "filterSelect", options: ["task_1"] });
    expect(
      fake.launches[0]?.session.kind === "fresh" && fake.launches[0].session.prompt,
    ).toStartWith("/implement");
  });

  test("lets the user choose between research and spec", async () => {
    const fake = fakeContext({ answers: ["task_1", "later"] });
    await fake.seed("task_1", (t) => {
      t.stages.new.done = true;
    });

    await homeCommand(fake.ctx);

    expect(fake.prompts[1]?.options).toEqual(["research", "spec", "later"]);
    expect(fake.launches).toEqual([]);
  });

  test("says so when nothing is in flight", async () => {
    const fake = fakeContext();
    await homeCommand(fake.ctx);
    expect(fake.logged("info")[0]).toContain("flow new");
  });
});

describe("status and archive", () => {
  test("status shows stages, setup and what's next", async () => {
    const fake = fakeContext();
    await fake.seed("task_1", readyWorktree);

    await statusCommand(fake.ctx, undefined);

    const [output] = fake.logged("message");
    expect(output).toContain("task_1 · Title of task_1");
    expect(output).toContain("branch: task_1/slug");
    expect(output).toContain("✔ spec");
    expect(output).toContain(`setup: ready (${WORKTREE})`);
    expect(output).toContain("next: impl");
  });

  test("open works for any explicit task, tracked or not", async () => {
    const opened: string[] = [];
    const fake = fakeContext({
      proc: {
        openUrl: async (url) => {
          opened.push(url);
        },
      },
    });

    await openCommand(fake.ctx, "task_untracked");

    expect(opened).toEqual(["https://app.getport.io/taskEntity?identifier=task_untracked"]);
  });

  test("archive removes the task from the in-flight list", async () => {
    const fake = fakeContext();
    await fake.seed("task_1");

    await archiveCommand(fake.ctx, "task_1");
    await homeCommand(fake.ctx);

    expect((await fake.task("task_1")).archived).toBe(true);
    expect(fake.logged("info").at(-1)).toContain("No tasks in flight");
  });
});
