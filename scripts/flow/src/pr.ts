import { styleText } from "node:util";
import { z } from "zod";
import type { CompanionStage, TaskState } from "./state.ts";

export interface PrStatus {
  number: number;
  url: string;
  state: "open" | "closed" | "merged";
  draft: boolean;
  review?: "approved" | "changes-requested" | "review-required";
  checks?: "passing" | "failing" | "pending";
  conflicts: boolean;
  // The GitHub Actions runs with a failed check; other failed checks can't be rerun through gh.
  failedRuns: WorkflowRun[];
}

export interface WorkflowRun {
  repo: string;
  id: string;
}

// The implementation's PR is opened by impl; companion stages open theirs in another repo.
export type PrStage = "impl" | CompanionStage;
export type TaskPrs = Partial<Record<PrStage, PrStatus>>;

export const PR_VIEW_FIELDS = "number,url,state,isDraft,reviewDecision,mergeable,statusCheckRollup";

// A check run has status + conclusion; a commit status context only has state.
const checkSchema = z.object({
  status: z.string().nullish(),
  conclusion: z.string().nullish(),
  state: z.string().nullish(),
  detailsUrl: z.string().nullish(),
});

const RUN_URL = /^https:\/\/github\.com\/([^/]+\/[^/]+)\/actions\/runs\/(\d+)/;

const prViewSchema = z.object({
  number: z.number(),
  url: z.string(),
  state: z.enum(["OPEN", "CLOSED", "MERGED"]),
  isDraft: z.boolean(),
  reviewDecision: z.string().nullish(),
  mergeable: z.string().nullish(),
  statusCheckRollup: z.array(checkSchema).nullish(),
});

const FAILED = new Set([
  "FAILURE",
  "ERROR",
  "CANCELLED",
  "TIMED_OUT",
  "ACTION_REQUIRED",
  "STARTUP_FAILURE",
]);

const REVIEWS: Record<string, PrStatus["review"]> = {
  APPROVED: "approved",
  CHANGES_REQUESTED: "changes-requested",
  REVIEW_REQUIRED: "review-required",
};

function checkOutcome(check: z.infer<typeof checkSchema>): "pass" | "fail" | "pending" {
  if (check.status && check.status !== "COMPLETED") return "pending";
  const result = check.conclusion || check.state;
  if (!result || result === "PENDING" || result === "EXPECTED") return "pending";
  return FAILED.has(result) ? "fail" : "pass";
}

function summarizeChecks(rollup: z.infer<typeof checkSchema>[]): PrStatus["checks"] {
  if (rollup.length === 0) return undefined;
  const outcomes = new Set(rollup.map(checkOutcome));
  if (outcomes.has("fail")) return "failing";
  return outcomes.has("pending") ? "pending" : "passing";
}

// A run has a check per job, so several failed checks may share one run.
function failedRuns(rollup: z.infer<typeof checkSchema>[]): WorkflowRun[] {
  const runs = new Map<string, WorkflowRun>();
  for (const check of rollup) {
    if (checkOutcome(check) !== "fail") continue;
    const match = RUN_URL.exec(check.detailsUrl ?? "");
    if (match?.[1] && match[2]) runs.set(match[2], { repo: match[1], id: match[2] });
  }
  return [...runs.values()];
}

// Parses `gh pr view --json ${PR_VIEW_FIELDS}`.
export function parsePrView(raw: unknown): PrStatus {
  const pr = prViewSchema.parse(raw);
  const rollup = pr.statusCheckRollup ?? [];
  return {
    number: pr.number,
    url: pr.url,
    state: pr.state === "OPEN" ? "open" : pr.state === "MERGED" ? "merged" : "closed",
    draft: pr.isDraft,
    review: REVIEWS[pr.reviewDecision ?? ""],
    checks: summarizeChecks(rollup),
    conflicts: pr.mergeable === "CONFLICTING",
    failedRuns: failedRuns(rollup),
  };
}

// What to pass to `gh pr view` for each PR the task may have. Without a recorded URL, the
// implementation's PR can still be found from the branch once the spec is done.
export function prRefs(task: TaskState, stages: readonly PrStage[]): [PrStage, string][] {
  return stages.flatMap((stage): [PrStage, string][] => {
    const ref =
      stage === "impl"
        ? (task.prUrl ?? (task.stages.spec.done ? task.branch : undefined))
        : task.stages[stage].prUrl;
    return ref ? [[stage, ref]] : [];
  });
}

export function describePr(pr: PrStatus): string {
  if (pr.state === "merged") return styleText("magenta", "merged");
  if (pr.state === "closed") return styleText("red", "closed");
  const parts = [
    pr.draft
      ? styleText("gray", "draft")
      : pr.review === "approved"
        ? styleText("green", "approved")
        : pr.review === "changes-requested"
          ? styleText("red", "changes requested")
          : pr.review === "review-required"
            ? styleText("yellow", "review required")
            : "open",
  ];
  if (pr.checks === "passing") parts.push(styleText("green", "checks passing"));
  if (pr.checks === "failing") parts.push(styleText("red", "checks failing"));
  if (pr.checks === "pending") parts.push(styleText("yellow", "checks pending"));
  if (pr.conflicts) parts.push(styleText("red", "conflicts"));
  return parts.join(" · ");
}
