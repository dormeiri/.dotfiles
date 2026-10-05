import type { StateStore } from "./store.ts";

export interface ProcResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export interface ClaudeLaunch {
  cwd: string;
  session: { kind: "fresh"; id: string; prompt: string } | { kind: "resume"; id: string };
  permissionMode?: "auto";
  addDirs: string[];
}

export interface PortTask {
  title: string;
  description: string;
  branch?: string;
}

export interface SetupStep {
  label: string;
  cmd: string[];
  cwd: string;
  env?: Record<string, string>;
  optional?: boolean;
}

export interface HeadlessLaunch {
  cwd: string;
  prompt: string;
  // Without a permission mode, only allowedTools may run (dontAsk).
  allowedTools?: string[];
  permissionMode?: "auto";
  sessionId?: string;
  addDirs?: string[];
}

export interface ProcessRunner {
  claudeHeadless(launch: HeadlessLaunch): Promise<ProcResult>;
  claudeInteractive(launch: ClaudeLaunch): Promise<void>;
  searchPortTasks(query: unknown): Promise<unknown>;
  getPortTask(taskId: string): Promise<PortTask>;
  markPortTaskInProgress(taskId: string): Promise<void>;
  assume(profile: string): Promise<boolean>;
  runStep(step: SetupStep): Promise<number>;
  prUrl(cwd: string): Promise<string | undefined>;
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
  spinner(message: string): { stop(message: string): void };
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
}

export interface Effects {
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
