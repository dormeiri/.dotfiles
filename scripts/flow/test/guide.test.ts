import { describe, expect, test } from "bun:test";
import { stripVTControlCharacters } from "node:util";
import type { HeadlessLaunch } from "../src/agent.ts";
import {
  adrCommand,
  archiveCommand,
  cdCommand,
  doneCommand,
  homeCommand,
  newCommand,
  openCommand,
  prCommand,
  pruneCommand,
  rebaseCommand,
  resumeCommand,
  sessionCommand,
  stageCommand,
  statusCommand,
} from "../src/commands.ts";
import { currentIterationQuery } from "../src/port.ts";
import type { PrStatus } from "../src/pr.ts";
import { createTaskPrompt } from "../src/stage-prompts.ts";
import type { TaskState } from "../src/state.ts";
import { CURRENT_ITERATION, DOCS_REPO, fakeContext, MAIN_REPO, readyWorktree } from "./fakes.ts";

const RESEARCH = `${MAIN_REPO}/.scratch/task_1/research.md`;
const SPEC = `${MAIN_REPO}/.scratch/task_1/spec.md`;
const WORKTREE = "/worktrees/port/task_1/slug";

const openPr = (overrides: Partial<PrStatus> = {}): PrStatus => ({
  number: 7,
  url: "https://github.com/o/r/pull/7",
  state: "open",
  draft: false,
  conflicts: false,
  ...overrides,
});

const createdTask = (taskId: string) => ({
  headless: async () => ({ ok: true, output: `✅ Done!\nTASK_ID: ${taskId}` }),
});

describe("flow new", () => {
  test("creates the task headlessly, verifies it, starts setup and offers research or spec", async () => {
    const headless: HeadlessLaunch[] = [];
    const opened: string[] = [];
    const fake = fakeContext({
      answers: [true, "later"],
      agent: {
        async headless(launch) {
          headless.push(launch);
          return createdTask("task_1").headless();
        },
      },
      proc: {
        openUrl: async (url) => {
          opened.push(url);
        },
      },
    });

    await newCommand(fake.ctx, "Login breaks on Safari");

    expect(headless).toEqual([
      {
        purpose: "createTask",
        cwd: MAIN_REPO,
        prompt: createTaskPrompt("Login breaks on Safari", CURRENT_ITERATION),
        access: "port-only",
        addDirs: [],
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

  test("puts the task in the team's current iteration", async () => {
    const searches: { blueprint: string; query: unknown }[] = [];
    let prompt = "";
    const fake = fakeContext({
      answers: [false],
      agent: {
        async headless(launch) {
          prompt = launch.prompt;
          return createdTask("task_1").headless();
        },
      },
      proc: {
        async searchPortEntities(blueprint, query) {
          searches.push({ blueprint, query });
          return { entities: [CURRENT_ITERATION] };
        },
      },
    });

    await newCommand(fake.ctx, "idea");

    expect(searches).toEqual([
      { blueprint: "team_iteration", query: currentIterationQuery("workflows_team") },
    ]);
    expect(prompt).toContain(`Iteration: ${CURRENT_ITERATION.identifier}`);
  });

  test("still creates the task when the current iteration can't be found", async () => {
    let prompt = "";
    const fake = fakeContext({
      answers: [false],
      agent: {
        async headless(launch) {
          prompt = launch.prompt;
          return createdTask("task_1").headless();
        },
      },
      proc: {
        searchPortEntities: async () => {
          throw new Error("401");
        },
      },
    });

    await newCommand(fake.ctx, "idea");

    expect(prompt).toBe(createTaskPrompt("idea"));
    expect(fake.logged("warn")).toContain(
      "Couldn't find workflows_team's current iteration (401), so /create-task picks one.",
    );
    expect((await fake.task("task_1")).taskId).toBe("task_1");
  });

  test("opens the editor when no input is given and stops if nothing was written", async () => {
    let headlessRuns = 0;
    const fake = fakeContext({
      answers: ["create"],
      agent: {
        headless: async () => {
          headlessRuns++;
          return { ok: true, output: "" };
        },
      },
    });

    await newCommand(fake.ctx, "");

    expect(fake.prompts[0]).toMatchObject({ kind: "select", options: ["create", "mine"] });
    expect(fake.editorTemplates).toHaveLength(1);
    expect(headlessRuns).toBe(0);
    expect(await fake.fx.store.list()).toEqual([]);
  });

  test("an assigned task is tracked without /create-task, refined with /update-task, then verified", async () => {
    let headlessRuns = 0;
    const opened: string[] = [];
    const fake = fakeContext({
      answers: ["mine", "task_mine", true, true, true, "later"],
      agent: {
        headless: async () => {
          headlessRuns++;
          return { ok: true, output: "" };
        },
      },
      proc: {
        openUrl: async (url) => {
          opened.push(url);
        },
        searchPortEntities: async () => ({
          entities: [{ identifier: "task_mine", title: "Mine" }],
        }),
      },
    });

    await newCommand(fake.ctx, undefined);

    expect(headlessRuns).toBe(0);
    expect(fake.editorTemplates).toEqual([]);
    expect(fake.launches).toHaveLength(1);
    const [launch] = fake.launches;
    expect(launch?.cwd).toBe(MAIN_REPO);
    expect(launch?.session.kind === "fresh" && launch.session.prompt).toStartWith(
      "/update-task\n\nTask: task_mine",
    );
    expect(fake.prompts.map((p) => p.message)).toEqual([
      "Start from",
      "Which of your tasks?",
      "Open it in the browser?",
      "Iterate on the description with the agent (/update-task) first?",
      "Does the task look right?",
      "What next for task_mine?",
    ]);
    const url = "https://app.getport.io/taskEntity?identifier=task_mine";
    expect(opened).toEqual([url, url]);
    const task = await fake.task("task_mine");
    expect(task.title).toBe("Title of task_mine");
    expect(task.stages.new.done).toBe(true);
  });

  test("an assigned task can skip opening it and the description session", async () => {
    const opened: string[] = [];
    const fake = fakeContext({
      answers: ["mine", "task_mine", false, false, false],
      proc: {
        openUrl: async (url) => {
          opened.push(url);
        },
        searchPortEntities: async () => ({
          entities: [{ identifier: "task_mine", title: "Mine" }],
        }),
      },
    });

    await newCommand(fake.ctx, undefined);

    expect(fake.launches).toEqual([]);
    // Only verification opens it.
    expect(opened).toHaveLength(1);
    expect((await fake.task("task_mine")).stages.new.done).toBe(false);
  });

  test("without assigned tasks, nothing is tracked", async () => {
    const fake = fakeContext({ answers: ["mine"] });

    await newCommand(fake.ctx, undefined);

    expect(fake.logged("warn")).toContain(
      "You have no open tasks in the current or next iteration.",
    );
    expect(await fake.fx.store.list()).toEqual([]);
  });

  test("without a marker, shows the agent's output and falls back to the task picker", async () => {
    const fake = fakeContext({
      answers: ["task_picked", false],
      agent: { headless: async () => ({ ok: true, output: "Created it, see link" }) },
      proc: {
        searchPortEntities: async () => ({
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
      agent: { headless: async () => ({ ok: false, output: "boom" }) },
    });

    await newCommand(fake.ctx, "idea");

    expect(fake.logged("message")).toContain("boom");
    expect(await fake.fx.store.list()).toEqual([]);
  });

  test("a rejected task stays tracked without a worktree and resumes at verification", async () => {
    const fake = fakeContext({ answers: [false], agent: createdTask("task_1") });
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
      agent: createdTask("task_1"),
      proc: { assume: async () => false },
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

  test("spec writes ADRs into the task's worktree, even while setup is still running", async () => {
    const WORKTREE = "/worktrees/repo/task_1/slug";
    const fake = fakeContext({
      answers: ["leave"],
      files: [WORKTREE],
      branches: { [MAIN_REPO]: "main" },
    });
    await fake.seed("task_1", (t) => {
      t.stages.new.done = true;
      t.setup = { status: "running", logPath: "/logs/task_1.log" };
    });

    await stageCommand(fake.ctx, "spec", "task_1");

    const [launch] = fake.launches;
    expect(launch?.cwd).toBe(MAIN_REPO);
    expect(launch?.addDirs).toEqual([WORKTREE]);
    const prompt = launch?.session.kind === "fresh" ? launch.session.prompt : "";
    expect(prompt).toContain(`${WORKTREE}/docs/decisions/`);
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

  test("resume still names the stage as the session's purpose", async () => {
    const fake = await withPreviousSession("resume");
    expect(fake.launches[0]?.purpose).toBe("spec");
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
    expect(launch?.access).toBe("auto");
    expect(launch?.addDirs).toEqual([`${MAIN_REPO}/.scratch/task_1`]);
    expect(launch?.session.kind === "fresh" && launch.session.prompt).toStartWith(
      `/implement ${SPEC}`,
    );
    const task = await fake.task("task_1");
    expect(task.stages.impl.done).toBe(true);
    expect(task.prUrl).toBe("https://github.com/o/r/pull/7");
    expect(fake.prompts.map((p) => p.options)).toEqual([
      ["review", "docs", "terraform", "announcement", "later"],
    ]);
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
    const fake = fakeContext({ answers: [true, "later"] });
    await fake.seed("task_1", (t) => {
      readyWorktree(t);
      t.stages.impl.done = true;
      t.prUrl = "https://github.com/o/r/pull/7";
    });

    await stageCommand(fake.ctx, "review", "task_1");

    expect(fake.prompts.at(-1)?.options).toEqual([
      "done",
      "docs",
      "terraform",
      "announcement",
      "later",
    ]);

    const session = fake.launches[0]?.session;
    expect(fake.launches[0]?.cwd).toBe(WORKTREE);
    expect(fake.launches[0]?.access).toBe("ask");
    expect(session?.kind === "fresh" && session.prompt).toStartWith("/code-review abc123");
    expect(session?.kind === "fresh" && session.prompt).toContain(SPEC);
    expect((await fake.task("task_1")).stages.review.done).toBe(true);
    expect(fake.logged("success").at(-1)).toContain("Mark it done once it's merged");
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

describe("docs and terraform PRs", () => {
  const DOCS_WORKTREE = "/worktrees/port-docs/task_1/slug";
  const implemented = (t: TaskState) => {
    readyWorktree(t);
    t.stages.impl.done = true;
    t.prUrl = "https://github.com/o/r/pull/7";
  };

  test("creates a docs worktree on the task's branch and records the docs PR on its stage", async () => {
    const steps: string[][] = [];
    const fake = fakeContext({
      answers: ["later"],
      files: [SPEC],
      proc: {
        runStep: async (step) => {
          steps.push([step.cwd, ...step.cmd]);
          return 0;
        },
        prUrl: async (cwd) =>
          cwd === DOCS_WORKTREE ? "https://github.com/o/docs/pull/3" : undefined,
      },
    });
    await fake.seed("task_1", implemented);

    await stageCommand(fake.ctx, "docs", "task_1");

    expect(steps).toEqual([
      [DOCS_REPO, "git", "fetch", "origin", "main"],
      [
        DOCS_REPO,
        ...["git", "worktree", "add", "--no-track", "-b", "task_1/slug", DOCS_WORKTREE],
        "origin/main",
      ],
    ]);
    const [launch] = fake.launches;
    expect(launch?.cwd).toBe(DOCS_WORKTREE);
    expect(launch?.access).toBe("auto");
    expect(launch?.addDirs).toEqual([`${MAIN_REPO}/.scratch/task_1`, WORKTREE]);
    const prompt = launch?.session.kind === "fresh" ? launch.session.prompt : "";
    expect(prompt).toStartWith("Document this task's user-facing change in port-docs.");
    expect(prompt).toContain(`Spec: ${SPEC}`);
    expect(prompt).toContain("Implementation PR: https://github.com/o/r/pull/7");
    expect(prompt).toContain("gh pr create --draft");
    expect(prompt).toContain("the /pr skill");
    const task = await fake.task("task_1");
    expect(task.stages.docs.done).toBe(true);
    expect(task.stages.docs.prUrl).toBe("https://github.com/o/docs/pull/3");
    expect(task.prUrl).toBe("https://github.com/o/r/pull/7");
    expect(fake.prompts.at(-1)?.options).toEqual(["review", "terraform", "announcement", "later"]);
  });

  test("reuses an existing terraform worktree", async () => {
    const TF_WORKTREE = "/worktrees/terraform-provider-port-labs/task_1/slug";
    let steps = 0;
    const fake = fakeContext({
      answers: ["leave"],
      files: [TF_WORKTREE],
      proc: {
        runStep: async () => {
          steps++;
          return 0;
        },
      },
    });
    await fake.seed("task_1", implemented);

    await stageCommand(fake.ctx, "terraform", "task_1");

    expect(steps).toBe(0);
    expect(fake.launches[0]?.cwd).toBe(TF_WORKTREE);
    const prompt = fake.launches[0]?.session.kind === "fresh" && fake.launches[0].session.prompt;
    expect(prompt).toStartWith("Add support for this task's change to the Port Terraform provider");
    expect((await fake.task("task_1")).stages.terraform.done).toBe(false);
  });

  test("checks out an existing local branch instead of creating it", async () => {
    const steps: string[][] = [];
    const fake = fakeContext({
      answers: ["leave"],
      existingBranches: ["task_1/slug"],
      proc: {
        runStep: async (step) => {
          steps.push(step.cmd);
          return 0;
        },
      },
    });
    await fake.seed("task_1", implemented);

    await stageCommand(fake.ctx, "docs", "task_1");

    expect(steps.at(-1)).toEqual(["git", "worktree", "add", DOCS_WORKTREE, "task_1/slug"]);
  });

  test("a failed worktree creation launches nothing", async () => {
    const fake = fakeContext({ proc: { runStep: async () => 128 } });
    await fake.seed("task_1", implemented);

    await stageCommand(fake.ctx, "docs", "task_1");

    expect(fake.launches).toEqual([]);
    expect(fake.logged("error").at(-1)).toContain("Couldn't create the docs worktree");
  });

  test("status lists the companion PRs", async () => {
    const fake = fakeContext();
    await fake.seed("task_1", (t) => {
      implemented(t);
      t.stages.terraform = { done: true, prUrl: "https://github.com/o/tf/pull/4" };
    });

    await statusCommand(fake.ctx, "task_1");

    expect(fake.logged("message")[0]).toContain("terraform PR: https://github.com/o/tf/pull/4");
  });
});

describe("announcement", () => {
  test("runs /product-announcement in the worktree and completes on confirmation", async () => {
    const fake = fakeContext({ answers: [true, "later"], files: [SPEC] });
    await fake.seed("task_1", (t) => {
      readyWorktree(t);
      t.stages.impl.done = true;
      t.prUrl = "https://github.com/o/r/pull/7";
      t.stages.docs = { done: true, prUrl: "https://github.com/o/docs/pull/3" };
    });

    await stageCommand(fake.ctx, "announcement", "task_1");

    const [launch] = fake.launches;
    expect(launch?.cwd).toBe(WORKTREE);
    expect(launch?.access).toBe("ask");
    const prompt = launch?.session.kind === "fresh" ? launch.session.prompt : "";
    expect(prompt).toStartWith("/product-announcement");
    expect(prompt).toContain(`Spec: ${SPEC}`);
    expect(prompt).toContain("PR: https://github.com/o/r/pull/7");
    expect(prompt).toContain("Docs PR: https://github.com/o/docs/pull/3");
    expect((await fake.task("task_1")).stages.announcement.done).toBe(true);
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
  test("offers in-flight tasks and runs the stage picked from the task's menu", async () => {
    const fake = fakeContext({ answers: ["task_1", "impl", false], files: [SPEC] });
    await fake.seed("task_1", readyWorktree);
    await fake.seed("task_old", (t) => {
      t.archived = true;
    });

    await homeCommand(fake.ctx);

    expect(fake.prompts[0]).toMatchObject({ kind: "filterSelect", options: ["task_1"] });
    expect(fake.prompts[1]?.options).toEqual([
      "impl",
      "session",
      "cd",
      "adr",
      "open-task",
      "open-pr",
      "archive",
      "later",
    ]);
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

    expect(fake.prompts[1]?.options).toEqual([
      "research",
      "spec",
      "session",
      "adr",
      "open-task",
      "archive",
      "later",
    ]);
    expect(fake.launches).toEqual([]);
  });

  test("opens the task and the PR from the menu, then returns to it", async () => {
    const opened: string[] = [];
    const fake = fakeContext({
      answers: ["task_1", "open-task", "open-pr", "later"],
      proc: {
        openUrl: async (url) => {
          opened.push(url);
        },
      },
    });
    await fake.seed("task_1", (t) => {
      readyWorktree(t);
      t.stages.impl.done = true;
      t.prUrl = "https://github.com/o/r/pull/7";
    });

    await homeCommand(fake.ctx);

    expect(opened).toEqual([
      "https://app.getport.io/taskEntity?identifier=task_1",
      "https://github.com/o/r/pull/7",
    ]);
    const menu = [
      "review",
      "docs",
      "terraform",
      "announcement",
      "session",
      "cd",
      "adr",
      "open-task",
      "open-pr",
      "archive",
      "later",
    ];
    expect(fake.prompts.slice(1).map((p) => p.options)).toEqual([menu, menu, menu]);
    expect(fake.launches).toEqual([]);
  });

  test("once every other stage is done, offers marking it done alongside opening", async () => {
    const fake = fakeContext({ answers: ["task_1", "later"] });
    await fake.seed("task_1", (t) => {
      readyWorktree(t);
      t.stages.impl.done = true;
      t.stages.review.done = true;
      t.stages.docs.done = true;
      t.stages.terraform.done = true;
      t.stages.announcement.done = true;
      t.prUrl = "https://github.com/o/r/pull/7";
    });

    await homeCommand(fake.ctx);

    expect(fake.prompts[1]?.options).toEqual([
      "done",
      "session",
      "cd",
      "adr",
      "open-task",
      "open-pr",
      "archive",
      "later",
    ]);
  });

  test("going to the worktree leaves flow so the shell can cd", async () => {
    const fake = fakeContext({ answers: ["task_1", "cd"] });
    await fake.seed("task_1", readyWorktree);

    await homeCommand(fake.ctx);

    expect(fake.cds).toEqual([WORKTREE]);
    expect(fake.remainingAnswers).toEqual([]);
  });

  test("archives the task from the menu after confirming", async () => {
    const fake = fakeContext({ answers: ["task_1", "archive", false, "archive", true] });
    await fake.seed("task_1", readyWorktree);

    await homeCommand(fake.ctx);

    expect(fake.prompts.map((p) => p.kind)).toEqual([
      "filterSelect",
      "filterSelect",
      "confirm",
      "filterSelect",
      "confirm",
    ]);
    expect((await fake.task("task_1")).archived).toBe(true);
    expect(fake.launches).toEqual([]);
  });

  test("groups the tasks by stage, labelled with their PR's status", async () => {
    const fake = fakeContext({
      answers: [undefined],
      proc: {
        prStatus: async (ref) =>
          ref === "task_2/slug" ? openPr({ number: 8, checks: "failing" }) : undefined,
      },
    });
    await fake.seed("task_1", (t) => {
      readyWorktree(t);
      t.stages.impl.done = true;
      t.stages.review.done = true;
    });
    await fake.seed("task_2", readyWorktree);
    await fake.seed("task_3");

    await homeCommand(fake.ctx);

    const choices = fake.prompts[0]?.choices.map((c) => ({
      value: c.value,
      group: c.group,
      label: stripVTControlCharacters(c.label),
    }));
    expect(choices).toEqual([
      { value: "task_3", group: "Verify & set up", label: "Title of task_3  task_3" },
      {
        value: "task_2",
        group: "Implement",
        label: "Title of task_2  PR #8 open · checks failing  task_2",
      },
      { value: "task_1", group: "Reviewed", label: "Title of task_1  task_1" },
    ]);
  });

  test("says so when nothing is in flight", async () => {
    const fake = fakeContext();
    await homeCommand(fake.ctx);
    expect(fake.logged("info")[0]).toContain("flow new");
  });
});

describe("flow resume", () => {
  test("shows the menu of the most recently updated in-flight task", async () => {
    const fake = fakeContext({ answers: ["later"] });
    const at = (iso: string) => (t: TaskState) => {
      t.updatedAt = iso;
    };
    await fake.seed("task_old", at("2026-10-01T00:00:00.000Z"));
    await fake.seed("task_recent", at("2026-10-05T00:00:00.000Z"));
    await fake.seed("task_archived", (t) => {
      t.archived = true;
      t.updatedAt = "2026-10-06T00:00:00.000Z";
    });
    await fake.seed("task_middle", at("2026-10-03T00:00:00.000Z"));

    await resumeCommand(fake.ctx);

    expect(fake.logged("info")).toContain("Resuming Title of task_recent (task_recent)");
    expect(fake.prompts.map((p) => p.message)).toEqual(["What next for task_recent?"]);
  });

  test("says so when nothing is in flight", async () => {
    const fake = fakeContext();
    await resumeCommand(fake.ctx);
    expect(fake.logged("info")[0]).toContain("flow new");
    expect(fake.prompts).toEqual([]);
  });
});

describe("flow session", () => {
  test("starts a fresh session in the ready worktree with the task's context", async () => {
    const fake = fakeContext({ files: [SPEC] });
    await fake.seed("task_1", (t) => {
      readyWorktree(t);
      t.prUrl = "https://github.com/o/r/pull/7";
    });

    await sessionCommand(fake.ctx, "task_1");

    const [launch] = fake.launches;
    expect(launch?.cwd).toBe(WORKTREE);
    expect(launch?.access).toBe("ask");
    expect(launch?.addDirs).toEqual([`${MAIN_REPO}/.scratch/task_1`]);
    const prompt = launch?.session.kind === "fresh" ? launch.session.prompt : "";
    expect(prompt).toContain("Task: task_1 (https://app.getport.io/taskEntity?identifier=task_1)");
    expect(prompt).toContain(`Spec: ${SPEC}`);
    expect(prompt).not.toContain("Research:");
    expect(prompt).toContain("PR: https://github.com/o/r/pull/7");
    const task = await fake.task("task_1");
    expect(Object.values(task.stages).some((stage) => stage.sessionId)).toBe(false);
  });

  test("runs in the main repo while the worktree isn't ready", async () => {
    const fake = fakeContext({ branches: { [MAIN_REPO]: "main" } });
    await fake.seed("task_1");

    await sessionCommand(fake.ctx, "task_1");

    expect(fake.launches[0]?.cwd).toBe(MAIN_REPO);
    expect(fake.launches[0]?.addDirs).toEqual([]);
    expect(fake.logged("info")[0]).toContain("main repo");
  });

  test("the flow picker starts a session and returns to the menu", async () => {
    const fake = fakeContext({ answers: ["task_1", "session", "later"] });
    await fake.seed("task_1", readyWorktree);

    await homeCommand(fake.ctx);

    expect(fake.launches.map((l) => l.cwd)).toEqual([WORKTREE]);
    expect(fake.prompts).toHaveLength(3);
  });
});

describe("flow adr", () => {
  const decided = { editText: async (initial: string) => `${initial}Use SQS over Kafka` };

  test("starts /significant-decision-making in the worktree and commits there", async () => {
    const fake = fakeContext({ files: [SPEC], proc: decided });
    await fake.seed("task_1", readyWorktree);

    await adrCommand(fake.ctx, "task_1");

    const [launch] = fake.launches;
    expect(launch?.cwd).toBe(WORKTREE);
    expect(launch?.addDirs).toEqual([`${MAIN_REPO}/.scratch/task_1`]);
    const prompt = launch?.session.kind === "fresh" ? launch.session.prompt : "";
    expect(prompt).toStartWith("/significant-decision-making # task_1: Title of task_1");
    expect(prompt).toContain("Use SQS over Kafka");
    expect(prompt).toContain(`Spec: ${SPEC}`);
    expect(prompt).toContain(
      "under this repo's docs/decisions/, then commit it to the current branch",
    );
    const task = await fake.task("task_1");
    expect(Object.values(task.stages).some((stage) => stage.sessionId)).toBe(false);
    expect(fake.logged("warn")).toEqual([]);
  });

  test("waits for a running setup, then writes the ADR in the worktree", async () => {
    const fake = fakeContext({
      answers: ["wait"],
      proc: decided,
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

    await adrCommand(fake.ctx, "task_1");

    expect(fake.prompts[0]?.options).toEqual(["wait", "exit"]);
    expect(fake.launches.map((l) => l.cwd)).toEqual([WORKTREE]);
  });

  test("never falls back to the main repo", async () => {
    const fake = fakeContext({ proc: decided });
    await fake.seed("task_1");

    await adrCommand(fake.ctx, "task_1");

    expect(fake.launches).toEqual([]);
    expect(fake.logged("error")[0]).toContain("hasn't started yet");
  });

  test("an unedited decision cancels", async () => {
    const fake = fakeContext();
    await fake.seed("task_1", readyWorktree);

    await adrCommand(fake.ctx, "task_1");

    expect(fake.launches).toEqual([]);
    expect(fake.logged("warn")).toEqual(["No decision written, so no ADR was started."]);
  });

  test("the flow picker records a decision and returns to the menu", async () => {
    const fake = fakeContext({ answers: ["task_1", "adr", "later"], proc: decided });
    await fake.seed("task_1", readyWorktree);

    await homeCommand(fake.ctx);

    expect(fake.launches.map((l) => l.cwd)).toEqual([WORKTREE]);
    expect(fake.prompts).toHaveLength(3);
  });
});

describe("session purposes", () => {
  test("each session is started for its purpose, which settings map to a harness and model", async () => {
    const fake = fakeContext({
      answers: ["leave"],
      files: [SPEC],
      proc: { editText: async (initial) => `${initial}Use SQS over Kafka` },
    });
    await fake.seed("task_1", readyWorktree);

    await stageCommand(fake.ctx, "impl", "task_1");
    await adrCommand(fake.ctx, "task_1");
    await rebaseCommand(fake.ctx, "task_1");

    expect(fake.launches.map((l) => [l.purpose, l.session.id.split(":")[1]])).toEqual([
      ["impl", "impl"],
      ["adr", "adr"],
      ["rebase", "rebase"],
    ]);
  });
});

describe("flow rebase", () => {
  const PR_URL = "https://github.com/o/r/pull/7";
  const withPr = (t: TaskState) => {
    readyWorktree(t);
    t.stages.impl.done = true;
    t.prUrl = PR_URL;
  };

  test("starts /rebase-pr in the worktree with the task's context", async () => {
    const fake = fakeContext({ files: [SPEC] });
    await fake.seed("task_1", withPr);

    await rebaseCommand(fake.ctx, "task_1");

    const [launch] = fake.launches;
    expect(launch?.cwd).toBe(WORKTREE);
    expect(launch?.addDirs).toEqual([`${MAIN_REPO}/.scratch/task_1`]);
    const prompt = launch?.session.kind === "fresh" ? launch.session.prompt : "";
    expect(prompt).toStartWith("/rebase-pr\n");
    expect(prompt).toContain(`Spec: ${SPEC}`);
    expect(prompt).toContain(`PR: ${PR_URL}`);
    const task = await fake.task("task_1");
    expect(Object.values(task.stages).some((stage) => stage.sessionId)).toBe(false);
  });

  test("never falls back to the main repo", async () => {
    const fake = fakeContext();
    await fake.seed("task_1");

    await rebaseCommand(fake.ctx, "task_1");

    expect(fake.launches).toEqual([]);
    expect(fake.logged("error")[0]).toContain("hasn't started yet");
  });

  test("the menu offers it while the PR has conflicts, and drops it once resolved", async () => {
    let conflicts = true;
    const fake = fakeContext({
      answers: ["task_1", "rebase", "later"],
      proc: { prStatus: async () => openPr({ conflicts }) },
      onSession: () => {
        conflicts = false;
      },
    });
    await fake.seed("task_1", withPr);

    await homeCommand(fake.ctx);

    const [before, after] = fake.prompts.slice(1).map((p) => p.options);
    expect(before?.slice(0, 6)).toEqual([
      "review",
      "docs",
      "terraform",
      "announcement",
      "rebase",
      "session",
    ]);
    expect(after).not.toContain("rebase");
    expect(fake.launches.map((l) => l.cwd)).toEqual([WORKTREE]);
  });

  test("the menu doesn't offer it for a merged PR", async () => {
    const fake = fakeContext({
      answers: ["task_1", "later"],
      proc: { prStatus: async () => openPr({ state: "merged", conflicts: true }) },
    });
    await fake.seed("task_1", withPr);

    await homeCommand(fake.ctx);

    expect(fake.prompts[1]?.options).not.toContain("rebase");
  });
});

describe("flow cd", () => {
  const DOCS_WORKTREE = "/worktrees/port-docs/task_1/slug";

  test("goes straight to the only worktree", async () => {
    const fake = fakeContext();
    await fake.seed("task_1", readyWorktree);

    await cdCommand(fake.ctx, "task_1");

    expect(fake.cds).toEqual([WORKTREE]);
    expect(fake.prompts).toEqual([]);
  });

  test("asks which one once a companion worktree exists", async () => {
    const fake = fakeContext({ answers: [DOCS_WORKTREE], files: [DOCS_WORKTREE] });
    await fake.seed("task_1", readyWorktree);

    await cdCommand(fake.ctx, "task_1");

    expect(fake.prompts[0]?.options).toEqual([WORKTREE, DOCS_WORKTREE]);
    expect(fake.cds).toEqual([DOCS_WORKTREE]);
  });

  test("without a worktree there's nowhere to go", async () => {
    const fake = fakeContext();
    await fake.seed("task_1");

    await cdCommand(fake.ctx, "task_1");

    expect(fake.cds).toEqual([]);
    expect(fake.logged("warn")).toEqual(["task_1 has no worktree yet."]);
  });

  test("without the shell function, prints the cd to run", async () => {
    const fake = fakeContext({ withoutShellFunction: true });
    await fake.seed("task_1", readyWorktree);

    await cdCommand(fake.ctx, "task_1");

    expect(fake.logged("info").at(-1)).toContain(`cd ${WORKTREE}`);
  });
});

describe("status and archive", () => {
  test("status shows stages, setup and what's next", async () => {
    const fake = fakeContext();
    await fake.seed("task_1", readyWorktree);

    await statusCommand(fake.ctx, undefined);

    const [output = ""] = fake.logged("message");
    expect(stripVTControlCharacters(output)).toStartWith("Title of task_1  task_1");
    expect(output).toContain("branch: task_1/slug");
    expect(output).toContain("✔ spec");
    expect(output).toContain(`setup: ready (${WORKTREE})`);
    expect(output).toContain("next: impl");
  });

  test("status groups tasks by stage and shows each PR's status", async () => {
    const looked: { ref: string; cwd: string }[] = [];
    const fake = fakeContext({
      proc: {
        async prStatus(ref, cwd) {
          looked.push({ ref, cwd });
          if (ref === "https://github.com/o/r/pull/7") return openPr({ draft: true });
          if (ref === "https://github.com/o/docs/pull/3") {
            return openPr({ number: 3, url: ref, state: "merged" });
          }
          return undefined;
        },
      },
    });
    await fake.seed("task_1", (t) => {
      readyWorktree(t);
      t.stages.impl.done = true;
      t.prUrl = "https://github.com/o/r/pull/7";
      t.stages.docs = { done: true, prUrl: "https://github.com/o/docs/pull/3" };
    });
    await fake.seed("task_2");

    await statusCommand(fake.ctx, undefined);

    expect(fake.logged("step")).toEqual(["Verify & set up", "Review"]);
    const [fresh = "", reviewing = ""] = fake.logged("message").map(stripVTControlCharacters);
    expect(fresh).toStartWith("Title of task_2");
    expect(reviewing).toContain("PR: draft  https://github.com/o/r/pull/7");
    expect(reviewing).toContain("docs PR: merged  https://github.com/o/docs/pull/3");
    expect(looked).toEqual([
      { ref: "https://github.com/o/r/pull/7", cwd: MAIN_REPO },
      { ref: "https://github.com/o/docs/pull/3", cwd: MAIN_REPO },
    ]);
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

  test("pr opens the recorded PR", async () => {
    const opened: string[] = [];
    const fake = fakeContext({
      proc: {
        openUrl: async (url) => {
          opened.push(url);
        },
      },
    });
    await fake.seed("task_1", (t) => {
      t.prUrl = "https://github.com/o/r/pull/7";
    });

    await prCommand(fake.ctx, "task_1");

    expect(opened).toEqual(["https://github.com/o/r/pull/7"]);
  });

  test("pr finds an unrecorded PR from the worktree and records it", async () => {
    const opened: string[] = [];
    const fake = fakeContext({
      proc: {
        prUrl: async (cwd) => (cwd === WORKTREE ? "https://github.com/o/r/pull/8" : undefined),
        openUrl: async (url) => {
          opened.push(url);
        },
      },
    });
    await fake.seed("task_1", readyWorktree);

    await prCommand(fake.ctx, "task_1");

    expect(opened).toEqual(["https://github.com/o/r/pull/8"]);
    expect((await fake.task("task_1")).prUrl).toBe("https://github.com/o/r/pull/8");
  });

  test("pr warns when the task has no PR", async () => {
    const opened: string[] = [];
    const fake = fakeContext({
      proc: {
        openUrl: async (url) => {
          opened.push(url);
        },
      },
    });
    await fake.seed("task_1", readyWorktree);

    await prCommand(fake.ctx, "task_1");

    expect(opened).toEqual([]);
    expect(fake.logged("warn")).toEqual(["task_1 has no PR yet."]);
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

describe("flow done", () => {
  test("sets the task to Done in Port and archives it", async () => {
    const statuses: [string, string][] = [];
    const fake = fakeContext({
      proc: {
        setPortTaskStatus: async (taskId, status) => {
          statuses.push([taskId, status]);
        },
      },
    });
    await fake.seed("task_1");

    await doneCommand(fake.ctx, "task_1");

    expect(statuses).toEqual([["task_1", "Done"]]);
    expect((await fake.task("task_1")).archived).toBe(true);
  });

  test("keeps the task in flight when Port fails", async () => {
    const fake = fakeContext({
      proc: {
        setPortTaskStatus: async () => {
          throw new Error("401");
        },
      },
    });
    await fake.seed("task_1");

    await expect(doneCommand(fake.ctx, "task_1")).rejects.toThrow("401");
    expect((await fake.task("task_1")).archived).toBe(false);
  });

  test("is the stage after review in the task's menu", async () => {
    const statuses: string[] = [];
    const fake = fakeContext({
      answers: ["task_1", "done"],
      proc: {
        setPortTaskStatus: async (_, status) => {
          statuses.push(status);
        },
      },
    });
    await fake.seed("task_1", (t) => {
      readyWorktree(t);
      t.stages.impl.done = true;
      t.stages.review.done = true;
    });

    await homeCommand(fake.ctx);

    expect(statuses).toEqual(["Done"]);
    const task = await fake.task("task_1");
    expect(task.stages.done.done).toBe(true);
    expect(task.archived).toBe(true);
    expect(fake.remainingAnswers).toEqual([]);
  });
});

describe("flow prune", () => {
  const DOCS_WORKTREE = "/worktrees/port-docs/task_1/slug";
  const archivedWorktree = (task: TaskState) => {
    readyWorktree(task);
    task.archived = true;
  };

  test("removes the archived tasks' worktrees, companions included, and forgets them", async () => {
    const fake = fakeContext({ answers: [true], files: [WORKTREE, DOCS_WORKTREE] });
    await fake.seed("task_1", archivedWorktree);
    await fake.seed("task_2", readyWorktree);

    await pruneCommand(fake.ctx);

    expect(fake.removedWorktrees).toEqual([
      { repo: MAIN_REPO, dir: WORKTREE },
      { repo: DOCS_REPO, dir: DOCS_WORKTREE },
    ]);
    expect((await fake.task("task_1")).worktreePath).toBeUndefined();
    expect((await fake.task("task_2")).worktreePath).toBe("/worktrees/port/task_2/slug");
  });

  test("removes nothing when declined", async () => {
    const fake = fakeContext({ answers: [false], files: [WORKTREE] });
    await fake.seed("task_1", archivedWorktree);

    await pruneCommand(fake.ctx);

    expect(fake.removedWorktrees).toEqual([]);
    expect((await fake.task("task_1")).worktreePath).toBe(WORKTREE);
  });

  test("keeps a worktree git refuses to remove and goes on with the rest", async () => {
    const fake = fakeContext({
      answers: [true],
      files: [WORKTREE, DOCS_WORKTREE],
      worktreeErrors: { [WORKTREE]: "fatal: contains modified or untracked files" },
    });
    await fake.seed("task_1", archivedWorktree);

    await pruneCommand(fake.ctx);

    expect(fake.removedWorktrees).toEqual([{ repo: DOCS_REPO, dir: DOCS_WORKTREE }]);
    expect(fake.logged("warn")).toEqual(["fatal: contains modified or untracked files"]);
    expect((await fake.task("task_1")).worktreePath).toBe(WORKTREE);
  });

  test("--force removes a worktree with uncommitted changes, after saying they're lost", async () => {
    const fake = fakeContext({
      answers: [true],
      files: [WORKTREE],
      worktreeErrors: { [WORKTREE]: "fatal: contains modified or untracked files" },
    });
    await fake.seed("task_1", archivedWorktree);

    await pruneCommand(fake.ctx, { force: true });

    expect(fake.prompts[0]?.message).toContain("uncommitted changes are lost");
    expect(fake.removedWorktrees).toEqual([{ repo: MAIN_REPO, dir: WORKTREE }]);
    expect((await fake.task("task_1")).worktreePath).toBeUndefined();
  });

  test("forgets a recorded worktree that's already gone, without asking", async () => {
    const fake = fakeContext();
    await fake.seed("task_1", archivedWorktree);

    await pruneCommand(fake.ctx);

    expect(fake.prompts).toEqual([]);
    expect(fake.logged("info")).toEqual(["No archived task has a worktree."]);
    expect((await fake.task("task_1")).worktreePath).toBeUndefined();
  });
});
