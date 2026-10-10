import type { Agent } from "./agent.ts";
import type { PortTask, PortTaskStatus } from "./port.ts";
import type { PrStatus, WorkflowRun } from "./pr.ts";
import type { StateStore } from "./store.ts";

export interface ProcResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export interface SetupStep {
  label: string;
  cmd: string[];
  cwd: string;
  env?: Record<string, string>;
  optional?: boolean;
}

export interface ProcessRunner {
  searchPortEntities(blueprint: string, query: unknown): Promise<unknown>;
  getPortTask(taskId: string): Promise<PortTask>;
  setPortTaskStatus(taskId: string, status: PortTaskStatus): Promise<void>;
  assume(profile: string): Promise<boolean>;
  runStep(step: SetupStep): Promise<number>;
  prUrl(cwd: string): Promise<string | undefined>;
  // ref is a PR URL, or a branch of the repo at cwd; undefined when there's no PR or gh fails.
  prStatus(ref: string, cwd: string): Promise<PrStatus | undefined>;
  // Returns gh's error when it fails.
  rerunFailedJobs(run: WorkflowRun): Promise<string | undefined>;
  openUrl(url: string): Promise<void>;
  editText(initial: string): Promise<string>;
  spawnSetupRunner(taskId: string, logPath: string): void;
  tailLog(path: string): { stop(): void };
  isAlive(pid: number): boolean;
}

export interface Choice<T extends string> {
  value: T;
  label: string;
  hint?: string;
  // Consecutive choices sharing a group are listed under its heading.
  group?: string;
}

export interface Prompts {
  confirm(message: string): Promise<boolean>;
  select<T extends string>(message: string, choices: Choice<T>[]): Promise<T | undefined>;
  filterSelect<T extends string>(message: string, choices: Choice<T>[]): Promise<T | undefined>;
}

export interface Logger {
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
  success(message: string): void;
  message(message: string): void;
  step(message: string): void;
  spinner(message: string): { stop(message: string): void; clear(): void };
}

export interface FsProbe {
  exists(path: string): Promise<boolean>;
  readText(path: string): Promise<string>;
  ensureDir(path: string): Promise<void>;
}

export interface GitProbe {
  currentBranch(cwd: string): Promise<string | undefined>;
  branchExists(repo: string, branch: string): Promise<boolean>;
  mergeBase(cwd: string, ref: string): Promise<string | undefined>;
  // Unless forced, refuses a worktree with uncommitted changes; returns git's error when it fails.
  removeWorktree(repo: string, dir: string, force: boolean): Promise<string | undefined>;
}

export interface Effects {
  agent: Agent;
  proc: ProcessRunner;
  prompts: Prompts;
  notify(title: string, message: string): Promise<void>;
  store: StateStore;
  fs: FsProbe;
  git: GitProbe;
  log: Logger;
  sleep(ms: number): Promise<void>;
  // False when flow wasn't started through the shell function that performs the cd on exit.
  changeDir(path: string): Promise<boolean>;
}
