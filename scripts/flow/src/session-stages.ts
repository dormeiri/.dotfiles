import { type Context, refreshTaskDetails } from "./context.ts";
import { grillPrompt, implementPrompt, researchPrompt, reviewPrompt } from "./stage-prompts.ts";
import type { SessionStage, TaskState } from "./state.ts";
import { editedText, editorResult, researchTemplate, specTemplate } from "./templates.ts";

export interface Session {
  ctx: Context;
  task: TaskState;
  stage: SessionStage;
  cwd: string;
}

export type StageOutput = { found: true; prUrl?: string } | { found: false; expected: string };

interface SessionStageSpec {
  inWorktree: boolean;
  permissionMode?: "auto";
  prompt(session: Session): Promise<string | undefined>;
  // Stages without an artifact to check leave completion to the user.
  findOutput?(session: Session): Promise<StageOutput>;
}

async function existingResearch({ ctx, task }: Session): Promise<string | undefined> {
  return (await ctx.fx.fs.exists(task.researchPath)) ? task.researchPath : undefined;
}

async function fromEditor(
  { ctx }: Session,
  template: string,
  cancelled: string,
): Promise<string | undefined> {
  const text = editorResult(template, await ctx.fx.proc.editText(template));
  if (!text) ctx.fx.log.warn(cancelled);
  return text;
}

async function fileOutput({ ctx }: Session, path: string): Promise<StageOutput> {
  return (await ctx.fx.fs.exists(path)) ? { found: true } : { found: false, expected: path };
}

export const SESSION_STAGES: Record<SessionStage, SessionStageSpec> = {
  research: {
    inWorktree: false,
    async prompt(session) {
      const { task } = session;
      const template = researchTemplate(await refreshTaskDetails(session.ctx, task));
      const question = await fromEditor(
        session,
        template,
        "No question written, so research was cancelled.",
      );
      return (
        question &&
        researchPrompt({ taskId: task.taskId, question, researchPath: task.researchPath })
      );
    },
    findOutput: (session) => fileOutput(session, session.task.researchPath),
  },
  spec: {
    inWorktree: false,
    async prompt(session) {
      const { ctx, task } = session;
      const details = await refreshTaskDetails(ctx, task);
      const template = specTemplate(details, await existingResearch(session));
      const text = editedText(await ctx.fx.proc.editText(template));
      if (!text) ctx.fx.log.warn("The editor was emptied, so the spec was cancelled.");
      return text && grillPrompt({ taskId: task.taskId, task: text, specPath: task.specPath });
    },
    findOutput: (session) => fileOutput(session, session.task.specPath),
  },
  impl: {
    inWorktree: true,
    permissionMode: "auto",
    async prompt(session) {
      const { ctx, task } = session;
      const { specPath } = task;
      const hasSpec = await ctx.fx.fs.exists(specPath);
      if (
        !hasSpec &&
        !(await ctx.fx.prompts.confirm(`There's no spec at ${specPath}. Implement anyway?`))
      ) {
        return undefined;
      }
      return implementPrompt({
        taskId: task.taskId,
        specPath,
        researchPath: await existingResearch(session),
      });
    },
    async findOutput({ ctx, cwd }) {
      const prUrl = await ctx.fx.proc.prUrl(cwd);
      return prUrl ? { found: true, prUrl } : { found: false, expected: "a PR for this branch" };
    },
  },
  review: {
    inWorktree: true,
    async prompt({ ctx, task, cwd }) {
      const base = (await ctx.fx.git.mergeBase(cwd, "origin/main")) ?? "origin/main";
      return reviewPrompt({
        taskId: task.taskId,
        specPath: task.specPath,
        base,
        prUrl: task.prUrl,
      });
    },
  },
};

export function mainRepoWarning(branch: string | undefined): string | undefined {
  if (branch === "main") return undefined;
  const current = branch ? `on '${branch}'` : "on an unknown branch";
  return `The main repo is ${current}, not main, so this session will see that branch's code.`;
}
