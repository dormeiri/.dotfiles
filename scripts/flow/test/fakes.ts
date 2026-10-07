import { randomUUID } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Agent, AgentLaunch } from "../src/agent.ts";
import { AGENT_SETTINGS } from "../src/agent-settings.ts";
import type { Config } from "../src/config.ts";
import type { Context } from "../src/context.ts";
import type { Choice, Effects, ProcessRunner } from "../src/effects.ts";
import { newTaskState, type TaskState } from "../src/state.ts";
import { fileStore } from "../src/store.ts";
import { artifactPaths } from "../src/task.ts";

type Answer = boolean | string | undefined;

export interface PromptRecord {
  kind: "confirm" | "select" | "filterSelect";
  message: string;
  options: string[];
  choices: Choice<string>[];
}

export interface FakeOptions {
  answers?: Answer[];
  agent?: Partial<Agent>;
  proc?: Partial<ProcessRunner>;
  files?: string[];
  branches?: Record<string, string>;
  existingBranches?: string[];
  cwd?: string;
  onSession?: (launch: AgentLaunch) => void | Promise<void>;
  onSleep?: () => void | Promise<void>;
  withoutShellFunction?: boolean;
  // Worktree dir → the error git gives when removing it.
  worktreeErrors?: Record<string, string>;
}

export const MAIN_REPO = "/repo";
export const DOCS_REPO = "/port-docs";
export const TERRAFORM_REPO = "/terraform-provider-port-labs";
export const CURRENT_ITERATION = {
  identifier: "team_iteration_1",
  title: "Oct 26 - Workflows Team",
};

export function fakeContext(options: FakeOptions = {}) {
  const config: Config = {
    mainRepo: MAIN_REPO,
    companionRepos: { docs: DOCS_REPO, terraform: TERRAFORM_REPO },
    worktreesDir: "/worktrees",
    pullMiddlewaresScript: "/scripts/pull-middlewares.sh",
    stateDir: mkdtempSync(join(tmpdir(), "flow-test-")),
    portTeam: "workflows_team",
    agents: AGENT_SETTINGS,
  };
  const answers = [...(options.answers ?? [])];
  const prompts: PromptRecord[] = [];
  const logs: { level: string; message: string }[] = [];
  const launches: AgentLaunch[] = [];
  const editorTemplates: string[] = [];
  const spawnedRunners: { taskId: string; logPath: string }[] = [];
  const notifications: { title: string; message: string }[] = [];
  const cds: string[] = [];
  const removedWorktrees: { repo: string; dir: string }[] = [];
  const files = new Set(options.files);
  const texts = new Map<string, string>();

  const answer = (record: PromptRecord): Answer => {
    prompts.push(record);
    if (answers.length === 0) throw new Error(`Unexpected prompt: ${record.message}`);
    return answers.shift();
  };
  const log =
    (level: string) =>
    (message: string): void => {
      logs.push({ level, message });
    };

  const agent: Agent = {
    newSession: async (purpose) => `fake:${purpose}:${randomUUID()}`,
    async interactive(launch) {
      launches.push(launch);
      await options.onSession?.(launch);
    },
    headless: async () => ({ ok: true, output: "" }),
    ...options.agent,
  };

  const proc: ProcessRunner = {
    searchPortEntities: async (blueprint) => ({
      entities: blueprint === "team_iteration" ? [CURRENT_ITERATION] : [],
    }),
    getPortTask: async (taskId) => ({
      title: `Title of ${taskId}`,
      description: `Description of ${taskId}`,
      branch: `${taskId}/slug`,
    }),
    setPortTaskStatus: async () => {},
    assume: async () => true,
    runStep: async () => 0,
    prUrl: async () => undefined,
    prStatus: async () => undefined,
    openUrl: async () => {},
    async editText(initial) {
      editorTemplates.push(initial);
      return initial;
    },
    spawnSetupRunner(taskId, logPath) {
      spawnedRunners.push({ taskId, logPath });
    },
    tailLog: () => ({ stop() {} }),
    isAlive: () => true,
    ...options.proc,
  };

  const fx: Effects = {
    agent,
    proc,
    prompts: {
      confirm: async (message) =>
        answer({ kind: "confirm", message, options: [], choices: [] }) === true,
      select: async (message, choices) =>
        answer({ kind: "select", message, options: choices.map((c) => c.value), choices }) as never,
      filterSelect: async (message, choices) =>
        answer({
          kind: "filterSelect",
          message,
          options: choices.map((c) => c.value),
          choices,
        }) as never,
    },
    async notify(title, message) {
      notifications.push({ title, message });
    },
    store: fileStore(config.stateDir),
    fs: {
      exists: async (path) => files.has(path),
      async readText(path) {
        const text = texts.get(path);
        if (text === undefined) throw new Error(`ENOENT: ${path}`);
        return text;
      },
      ensureDir: async () => {},
    },
    git: {
      currentBranch: async (cwd) => options.branches?.[cwd],
      branchExists: async (_, branch) => options.existingBranches?.includes(branch) ?? false,
      mergeBase: async () => "abc123",
      async removeWorktree(repo, dir, force) {
        const error = options.worktreeErrors?.[dir];
        if (error && !force) return error;
        removedWorktrees.push({ repo, dir });
        files.delete(dir);
        return undefined;
      },
    },
    log: {
      info: log("info"),
      warn: log("warn"),
      error: log("error"),
      success: log("success"),
      message: log("message"),
      step: log("step"),
      spinner: () => ({ stop: log("spinner"), clear() {} }),
    },
    async sleep() {
      await options.onSleep?.();
    },
    async changeDir(path) {
      if (options.withoutShellFunction) return false;
      cds.push(path);
      return true;
    },
  };

  const ctx: Context = { fx, config, cwd: options.cwd ?? "/somewhere" };

  return {
    ctx,
    fx,
    config,
    prompts,
    logs,
    launches,
    editorTemplates,
    spawnedRunners,
    notifications,
    cds,
    removedWorktrees,
    files,
    texts,
    remainingAnswers: answers,
    logged: (level: string) => logs.filter((l) => l.level === level).map((l) => l.message),
    task: async (taskId: string) => {
      const task = await fx.store.get(taskId);
      if (!task) throw new Error(`${taskId} not in store`);
      return task;
    },
    async seed(taskId: string, change: (task: TaskState) => void = () => {}) {
      const task = newTaskState({
        taskId,
        title: `Title of ${taskId}`,
        branch: `${taskId}/slug`,
        ...artifactPaths(MAIN_REPO, taskId),
        now: new Date(),
      });
      change(task);
      await fx.store.create(task);
      return task;
    },
  };
}

export function readyWorktree(task: TaskState): void {
  task.stages.new.done = true;
  task.stages.spec.done = true;
  task.setup = { status: "ready", logPath: "/state/logs/setup.log" };
  task.worktreePath = `/worktrees/port/${task.taskId}/slug`;
}
