import { access, mkdir, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { errorMessage } from "./errors.ts";
import { parseTaskState, StateError, type TaskState, taskStateSchema } from "./state.ts";

export function notTracked(taskId: string): StateError {
  return new StateError(`${taskId} isn't tracked by flow`);
}

export function pathExists(path: string): Promise<boolean> {
  return access(path).then(
    () => true,
    () => false,
  );
}

export interface StateStore {
  list(): Promise<TaskState[]>;
  get(taskId: string): Promise<TaskState | undefined>;
  create(task: TaskState): Promise<void>;
  update(taskId: string, change: (task: TaskState) => void): Promise<TaskState>;
  setupLogPath(taskId: string): string;
}

const LOCK_RETRY_MS = 20;
const STALE_LOCK_MS = 2000;

// The CLI and the detached setup runner both update the same task file; without a lock one
// read-modify-write can silently undo the other's (e.g. a session ID write erasing "setup ready").
async function withLock<T>(file: string, run: () => Promise<T>): Promise<T> {
  const lock = `${file}.lock`;
  const started = Date.now();
  while (true) {
    try {
      await mkdir(lock);
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      // Holders keep the lock for milliseconds, so one this old was left by a crashed process.
      if (Date.now() - started > STALE_LOCK_MS) await rm(lock, { recursive: true, force: true });
      else await Bun.sleep(LOCK_RETRY_MS);
    }
  }
  try {
    return await run();
  } finally {
    await rm(lock, { recursive: true, force: true });
  }
}

export function fileStore(stateDir: string): StateStore {
  const tasksDir = join(stateDir, "tasks");
  const taskFile = (taskId: string) => join(tasksDir, `${taskId}.json`);

  async function read(file: string): Promise<TaskState> {
    try {
      return parseTaskState(JSON.parse(await readFile(file, "utf8")));
    } catch (error) {
      throw new StateError(`Invalid state file ${file}: ${errorMessage(error)}`);
    }
  }

  async function write(task: TaskState): Promise<void> {
    const file = taskFile(task.taskId);
    await mkdir(tasksDir, { recursive: true });
    // Write-then-rename so the detached setup runner and the CLI never read a half-written file.
    const tmp = `${file}.${process.pid}.tmp`;
    await writeFile(tmp, `${JSON.stringify(taskStateSchema.parse(task), null, 2)}\n`);
    await rename(tmp, file);
  }

  async function get(taskId: string): Promise<TaskState | undefined> {
    const file = taskFile(taskId);
    return (await pathExists(file)) ? read(file) : undefined;
  }

  return {
    async list() {
      const names = await readdir(tasksDir).catch((error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT") return [];
        throw error;
      });
      const tasks = await Promise.all(
        names.filter((name) => name.endsWith(".json")).map((name) => read(join(tasksDir, name))),
      );
      return tasks.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    },
    get,
    async create(task) {
      if (await get(task.taskId)) throw new StateError(`${task.taskId} is already tracked`);
      await write(task);
    },
    async update(taskId, change) {
      await mkdir(tasksDir, { recursive: true });
      return withLock(taskFile(taskId), async () => {
        const task = await get(taskId);
        if (!task) throw notTracked(taskId);
        change(task);
        await write(task);
        return task;
      });
    },
    setupLogPath: (taskId) => join(stateDir, "logs", `${taskId}-setup.log`),
  };
}
