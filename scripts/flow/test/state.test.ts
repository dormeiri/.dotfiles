import { describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  migrate,
  newTaskState,
  parseTaskState,
  STAGES,
  STATE_VERSION,
  StateError,
} from "../src/state.ts";
import { fileStore } from "../src/store.ts";

function state(taskId = "task_1", now = new Date("2026-01-01T00:00:00Z")) {
  return newTaskState({ taskId, title: "T", researchPath: "/r", specPath: "/s", now });
}

describe("parseTaskState", () => {
  test("accepts a current state", () => {
    expect(parseTaskState(JSON.parse(JSON.stringify(state())))).toEqual(state());
  });

  test("rejects a state without a version", () => {
    const { version: _, ...unversioned } = state();
    expect(() => parseTaskState(unversioned)).toThrow(StateError);
  });

  test("rejects a state written by a newer flow", () => {
    expect(() => parseTaskState({ ...state(), version: STATE_VERSION + 1 })).toThrow(/newer flow/);
  });

  test("rejects an invalid shape", () => {
    expect(() => parseTaskState({ ...state(), stages: {} })).toThrow(StateError);
    const badSession = state();
    badSession.stages.spec.sessionId = "";
    expect(() => parseTaskState(badSession)).toThrow(StateError);
  });
});

describe("migrate", () => {
  test("passes a current state through", () => {
    expect(migrate({ version: STATE_VERSION, x: 1 })).toEqual({ version: STATE_VERSION, x: 1 });
  });

  test("v1 gains pending docs, terraform and announcement stages", () => {
    const { docs: _, terraform: __, announcement: ___, ...v1Stages } = state().stages;
    const v1 = { ...JSON.parse(JSON.stringify(state())), version: 1, stages: v1Stages };
    expect(parseTaskState(v1)).toEqual(state());
  });

  test("v2 gains a pending announcement stage", () => {
    const { announcement: _, ...v2Stages } = state().stages;
    const v2 = { ...JSON.parse(JSON.stringify(state())), version: 2, stages: v2Stages };
    expect(parseTaskState(v2)).toEqual(state());
  });

  test("v3 gains an updatedAt of its creation time", () => {
    const { updatedAt: _, ...v3 } = { ...JSON.parse(JSON.stringify(state())), version: 3 };
    expect(parseTaskState(v3)).toEqual(state());
  });

  test("v4 session IDs become Claude's", () => {
    const id = "11111111-1111-4111-8111-111111111111";
    const v4 = { ...JSON.parse(JSON.stringify(state())), version: 4 };
    v4.stages.spec.sessionId = id;
    const expected = state();
    expected.stages.spec.sessionId = `claude:${id}`;
    expect(parseTaskState(v4)).toEqual(expected);
  });

  test("fails for an older version it has no migration for", () => {
    expect(() => migrate({ version: 0 })).toThrow(/no migration from v0/);
  });
});

describe("fileStore", () => {
  const store = () => fileStore(mkdtempSync(join(tmpdir(), "flow-store-")));

  test("round-trips a task and lists tasks oldest first", async () => {
    const s = store();
    await s.create(state("task_new", new Date("2026-02-01T00:00:00Z")));
    await s.create(state("task_old", new Date("2026-01-01T00:00:00Z")));
    expect((await s.get("task_new"))?.taskId).toBe("task_new");
    expect((await s.list()).map((t) => t.taskId)).toEqual(["task_old", "task_new"]);
  });

  test("returns nothing for untracked tasks and an empty state dir", async () => {
    const s = store();
    expect(await s.get("task_x")).toBe(undefined);
    expect(await s.list()).toEqual([]);
  });

  test("update persists the change", async () => {
    const s = store();
    await s.create(state());
    await s.update("task_1", (t) => {
      t.stages.spec.done = true;
    });
    expect((await s.get("task_1"))?.stages.spec.done).toBe(true);
  });

  test("update stamps updatedAt", async () => {
    const s = store();
    await s.create(state());
    const before = Date.now();
    await s.update("task_1", () => {});
    const updatedAt = Date.parse((await s.get("task_1"))?.updatedAt ?? "");
    expect(updatedAt).toBeGreaterThanOrEqual(before);
  });

  test("concurrent updates from separate stores don't undo each other", async () => {
    const dir = mkdtempSync(join(tmpdir(), "flow-store-"));
    await fileStore(dir).create(state());
    await Promise.all(
      STAGES.map((stage, i) =>
        fileStore(dir).update("task_1", (t) => {
          t.stages[stage].done = true;
          if (i === 0) t.setup = { status: "ready", logPath: "/log" };
        }),
      ),
    );
    const task = await fileStore(dir).get("task_1");
    expect(STAGES.every((stage) => task?.stages[stage].done)).toBe(true);
    expect(task?.setup?.status).toBe("ready");
  });

  test("a lock left behind by a crashed process doesn't block updates forever", async () => {
    const dir = mkdtempSync(join(tmpdir(), "flow-store-"));
    await fileStore(dir).create(state());
    await mkdir(join(dir, "tasks", "task_1.json.lock"));
    await fileStore(dir).update("task_1", (t) => {
      t.archived = true;
    });
    expect((await fileStore(dir).get("task_1"))?.archived).toBe(true);
  });

  test("refuses to create a task twice or update an untracked one", async () => {
    const s = store();
    await s.create(state());
    await expect(s.create(state())).rejects.toThrow(/already tracked/);
    await expect(s.update("task_x", () => {})).rejects.toThrow(/isn't tracked/);
  });

  test("refuses to write an invalid state", async () => {
    const s = store();
    await s.create(state());
    const update = s.update("task_1", (t) => {
      t.stages.impl.sessionId = "";
    });
    await expect(update).rejects.toThrow();
    expect((await s.get("task_1"))?.stages.impl.sessionId).toBe(undefined);
  });

  test("reports which state file is invalid", async () => {
    const dir = mkdtempSync(join(tmpdir(), "flow-store-"));
    await mkdir(join(dir, "tasks"));
    writeFileSync(join(dir, "tasks", "task_bad.json"), "{}");
    await expect(fileStore(dir).list()).rejects.toThrow(/task_bad\.json/);
  });
});
