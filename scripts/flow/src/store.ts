import { access, mkdir, readdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { errorMessage } from "./errors.ts";
import { parseTaskState, StateError, type TaskState, taskStateSchema } from "./state.ts";

export interface StateStore {
  list(): Promise<TaskState[]>;
  get(taskId: string): Promise<TaskState | undefined>;
  create(task: TaskState): Promise<void>;
  update(taskId: string, change: (task: TaskState) => void): Promise<TaskState>;
  setupLogPath(taskId: string): string;
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
    const exists = await access(file).then(
      () => true,
      () => false,
    );
    return exists ? read(file) : undefined;
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
      const task = await get(taskId);
      if (!task) throw new StateError(`${taskId} isn't tracked by flow`);
      change(task);
      await write(task);
      return task;
    },
    setupLogPath: (taskId) => join(stateDir, "logs", `${taskId}-setup.log`),
  };
}
