import { describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { migrate, newTaskState, parseTaskState, STATE_VERSION, StateError } from "../src/state.ts";
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
    badSession.stages.spec.sessionId = "not-a-uuid";
    expect(() => parseTaskState(badSession)).toThrow(StateError);
  });
});

describe("migrate", () => {
  test("chains migrations from an older version up to the target", () => {
    const migrations = {
      1: (s: Record<string, unknown>) => ({ ...s, renamed: s.old }),
      2: (s: Record<string, unknown>) => ({ ...s, added: true }),
    };
    expect(migrate({ version: 1, old: "x" }, migrations, 3)).toEqual({
      version: 3,
      old: "x",
      renamed: "x",
      added: true,
    });
  });

  test("fails when a migration step is missing", () => {
    expect(() => migrate({ version: 1 }, {}, 2)).toThrow(/no migration from v1/);
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
      t.stages.impl.sessionId = "nope";
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
