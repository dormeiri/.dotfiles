import { describe, expect, test } from "bun:test";
import { stripVTControlCharacters } from "node:util";
import { describePr, type PrStatus, parsePrView, prRefs } from "../src/pr.ts";
import { newTaskState } from "../src/state.ts";

const view = (overrides: Record<string, unknown> = {}) => ({
  number: 7,
  url: "https://github.com/o/r/pull/7",
  state: "OPEN",
  isDraft: false,
  reviewDecision: "",
  mergeable: "MERGEABLE",
  statusCheckRollup: [],
  ...overrides,
});

const run = (conclusion: string, status = "COMPLETED") => ({
  __typename: "CheckRun",
  status,
  conclusion,
});

const pr = (overrides: Partial<PrStatus> = {}): PrStatus => ({
  number: 7,
  url: "https://github.com/o/r/pull/7",
  state: "open",
  draft: false,
  conflicts: false,
  failedRuns: [],
  ...overrides,
});

describe("parsePrView", () => {
  test("reads state, draft, review and conflicts", () => {
    expect(
      parsePrView(
        view({ isDraft: true, reviewDecision: "CHANGES_REQUESTED", mergeable: "CONFLICTING" }),
      ),
    ).toEqual({
      number: 7,
      url: "https://github.com/o/r/pull/7",
      state: "open",
      draft: true,
      review: "changes-requested",
      checks: undefined,
      conflicts: true,
      failedRuns: [],
    });
    expect(parsePrView(view({ state: "MERGED", reviewDecision: null })).state).toBe("merged");
  });

  test("any failed check fails the checks, even with others pending", () => {
    const rollup = [run("SUCCESS"), run("", "IN_PROGRESS"), run("FAILURE")];
    expect(parsePrView(view({ statusCheckRollup: rollup })).checks).toBe("failing");
  });

  test("unfinished checks and status contexts are pending", () => {
    expect(
      parsePrView(view({ statusCheckRollup: [run("SUCCESS"), run("", "QUEUED")] })).checks,
    ).toBe("pending");
    expect(
      parsePrView(view({ statusCheckRollup: [{ __typename: "StatusContext", state: "PENDING" }] }))
        .checks,
    ).toBe("pending");
  });

  test("collects the Actions runs of failed checks, once per run", () => {
    const job = (conclusion: string, url: string | null) => ({
      ...run(conclusion),
      detailsUrl: url,
    });
    const rollup = [
      job("FAILURE", "https://github.com/o/r/actions/runs/42/job/1"),
      job("CANCELLED", "https://github.com/o/r/actions/runs/42/job/2"),
      job("TIMED_OUT", "https://github.com/o/r/actions/runs/43/job/3"),
      job("SUCCESS", "https://github.com/o/r/actions/runs/44/job/4"),
      job("FAILURE", "https://ci.example.com/build/5"),
      job("FAILURE", null),
    ];
    expect(parsePrView(view({ statusCheckRollup: rollup })).failedRuns).toEqual([
      { repo: "o/r", id: "42" },
      { repo: "o/r", id: "43" },
    ]);
  });

  test("skipped and neutral checks pass", () => {
    const rollup = [run("SUCCESS"), run("SKIPPED"), run("NEUTRAL")];
    expect(parsePrView(view({ statusCheckRollup: rollup })).checks).toBe("passing");
  });
});

describe("prRefs", () => {
  const task = (change: (t: ReturnType<typeof newTaskState>) => void = () => {}) => {
    const t = newTaskState({
      taskId: "task_1",
      title: "T",
      branch: "task_1/slug",
      researchPath: "/r",
      specPath: "/s",
      now: new Date(),
    });
    change(t);
    return t;
  };

  test("prefers the recorded URLs", () => {
    const t = task((t) => {
      t.prUrl = "https://github.com/o/r/pull/7";
      t.stages.docs.prUrl = "https://github.com/o/docs/pull/3";
    });
    expect(prRefs(t, ["impl", "docs", "terraform"])).toEqual([
      ["impl", "https://github.com/o/r/pull/7"],
      ["docs", "https://github.com/o/docs/pull/3"],
    ]);
  });

  test("falls back to the branch once the spec is done", () => {
    expect(prRefs(task(), ["impl"])).toEqual([]);
    expect(
      prRefs(
        task((t) => {
          t.stages.spec.done = true;
        }),
        ["impl"],
      ),
    ).toEqual([["impl", "task_1/slug"]]);
  });
});

describe("describePr", () => {
  const plain = (status: PrStatus) => stripVTControlCharacters(describePr(status));

  test("summarizes an open PR", () => {
    expect(plain(pr({ draft: true, checks: "passing" }))).toBe("draft · checks passing");
    expect(plain(pr({ review: "approved", checks: "failing", conflicts: true }))).toBe(
      "approved · checks failing · conflicts",
    );
    expect(plain(pr({ review: "review-required", checks: "pending" }))).toBe(
      "review required · checks pending",
    );
    expect(plain(pr())).toBe("open");
  });

  test("a merged or closed PR is just that", () => {
    expect(plain(pr({ state: "merged", checks: "failing" }))).toBe("merged");
    expect(plain(pr({ state: "closed" }))).toBe("closed");
  });
});
