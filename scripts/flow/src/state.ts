import { z } from "zod";

export const STAGES = ["new", "research", "spec", "impl", "review"] as const;
export type Stage = (typeof STAGES)[number];
export type SessionStage = Exclude<Stage, "new">;

export const STATE_VERSION = 1;

const stageStateSchema = z.object({
  done: z.boolean(),
  sessionId: z.uuid().optional(),
});

const setupSchema = z.object({
  status: z.enum(["running", "ready", "failed"]),
  logPath: z.string(),
  pid: z.number().int().optional(),
  error: z.string().optional(),
});

export const taskStateSchema = z.object({
  version: z.literal(STATE_VERSION),
  taskId: z.string().min(1),
  title: z.string(),
  branch: z.string().optional(),
  worktreePath: z.string().optional(),
  setup: setupSchema.optional(),
  researchPath: z.string(),
  specPath: z.string(),
  prUrl: z.string().optional(),
  stages: z.record(z.enum(STAGES), stageStateSchema),
  archived: z.boolean(),
  createdAt: z.iso.datetime(),
});

export type TaskState = z.infer<typeof taskStateSchema>;

export class StateError extends Error {}

type Migration = (state: Record<string, unknown>) => Record<string, unknown>;

// Keyed by the version each migration upgrades from; add one whenever STATE_VERSION is bumped.
const MIGRATIONS: Record<number, Migration> = {};

export function migrate(raw: unknown, migrations = MIGRATIONS, target = STATE_VERSION): unknown {
  if (typeof raw !== "object" || raw === null || !("version" in raw)) {
    throw new StateError("missing version");
  }
  let state = raw as Record<string, unknown>;
  const version = state.version;
  if (typeof version !== "number" || !Number.isInteger(version)) {
    throw new StateError(`invalid version ${JSON.stringify(version)}`);
  }
  if (version > target) {
    throw new StateError(`written by a newer flow (v${version}, this flow reads up to v${target})`);
  }
  for (let from = version; from < target; from++) {
    const step = migrations[from];
    if (!step) throw new StateError(`no migration from v${from}`);
    state = { ...step(state), version: from + 1 };
  }
  return state;
}

export function parseTaskState(raw: unknown): TaskState {
  const result = taskStateSchema.safeParse(migrate(raw));
  if (!result.success) throw new StateError(z.prettifyError(result.error));
  return result.data;
}

export function newTaskState(init: {
  taskId: string;
  title: string;
  branch?: string;
  researchPath: string;
  specPath: string;
  now: Date;
}): TaskState {
  return {
    version: STATE_VERSION,
    taskId: init.taskId,
    title: init.title,
    branch: init.branch,
    researchPath: init.researchPath,
    specPath: init.specPath,
    stages: Object.fromEntries(
      STAGES.map((stage) => [stage, { done: false }]),
    ) as TaskState["stages"],
    archived: false,
    createdAt: init.now.toISOString(),
  };
}
