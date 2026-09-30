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

export interface ProcessRunner {
  claudeHeadless(opts: {
    cwd: string;
    prompt: string;
    allowedTools: string[];
  }): Promise<ProcResult>;
  claudeInteractive(launch: ClaudeLaunch): Promise<void>;
  pickPortTask(): Promise<string | undefined>;
  getPortTask(taskId: string): Promise<PortTask>;
  setPortTaskStatus(taskId: string, status: string): Promise<void>;
  assume(profile: string): Promise<boolean>;
  runWtap(taskId: string): Promise<number>;
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
  pick<T extends string>(message: string, choices: Choice<T>[]): Promise<T | undefined>;
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
}
