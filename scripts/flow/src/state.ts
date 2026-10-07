import { z } from "zod";

// Companion stages open a follow-up PR in another repo once the implementation is done.
export const COMPANION_STAGES = ["docs", "terraform"] as const;
export type CompanionStage = (typeof COMPANION_STAGES)[number];

// Optional stages offered once the implementation is done.
export const FOLLOW_UP_STAGES = [...COMPANION_STAGES, "announcement"] as const;

export const STAGES = [
  "new",
  "research",
  "spec",
  "impl",
  "review",
  ...FOLLOW_UP_STAGES,
  "done",
] as const;
export type Stage = (typeof STAGES)[number];
export type SessionStage = Exclude<Stage, "new" | "done">;

export const STATE_VERSION = 6;

const stageStateSchema = z.object({
  done: z.boolean(),
  // Opaque to flow; the agent hands it out and resumes it.
  sessionId: z.string().min(1).optional(),
  // Only companion stages record their PR here; the implementation's PR is the task's prUrl.
  prUrl: z.string().optional(),
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
  updatedAt: z.iso.datetime(),
});

export type TaskState = z.infer<typeof taskStateSchema>;

export class StateError extends Error {}

type Migration = (state: Record<string, unknown>) => Record<string, unknown>;

// Keyed by the version each migration upgrades from; add one whenever STATE_VERSION is bumped.
const MIGRATIONS: Record<number, Migration> = {
  1: (state) => ({
    ...state,
    stages: {
      ...(state.stages as Record<string, unknown>),
      ...Object.fromEntries(COMPANION_STAGES.map((stage) => [stage, { done: false }])),
    },
  }),
  2: (state) => ({
    ...state,
    stages: { ...(state.stages as Record<string, unknown>), announcement: { done: false } },
  }),
  3: (state) => ({ ...state, updatedAt: state.createdAt }),
  // Session IDs name their harness; every session before v5 was Claude's.
  4: (state) => ({
    ...state,
    stages: Object.fromEntries(
      Object.entries(state.stages as Record<string, Record<string, unknown>>).map(
        ([stage, stageState]) => [
          stage,
          typeof stageState.sessionId === "string"
            ? { ...stageState, sessionId: `claude:${stageState.sessionId}` }
            : stageState,
        ],
      ),
    ),
  }),
  5: (state) => ({
    ...state,
    stages: { ...(state.stages as Record<string, unknown>), done: { done: false } },
  }),
};

export function migrate(raw: unknown): unknown {
  if (typeof raw !== "object" || raw === null || !("version" in raw)) {
    throw new StateError("missing version");
  }
  let state = raw as Record<string, unknown>;
  const version = state.version;
  if (typeof version !== "number" || !Number.isInteger(version)) {
    throw new StateError(`invalid version ${JSON.stringify(version)}`);
  }
  if (version > STATE_VERSION) {
    throw new StateError(
      `written by a newer flow (v${version}, this flow reads up to v${STATE_VERSION})`,
    );
  }
  for (let from = version; from < STATE_VERSION; from++) {
    const step = MIGRATIONS[from];
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
    updatedAt: init.now.toISOString(),
  };
}
