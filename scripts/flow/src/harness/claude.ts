import { randomUUID } from "node:crypto";
import type { Purpose } from "../agent.ts";
import type { ClaudeModel } from "../agent-settings.ts";
import { addDirArgs, type Harness } from "./harness.ts";

// Port MCP is the claude.ai "Port IO" connector; the port-cli skill is the fallback /create-task names.
export const PORT_ONLY_TOOLS = ["mcp__claude_ai_Port_IO", "Bash(port:*)", "Skill(port-cli)"];

export function claudeHarness(models: Record<Purpose, ClaudeModel>): Harness {
  const modelArgs = (purpose: Purpose) => {
    const { model, effort } = models[purpose];
    return ["--model", model, ...(effort ? ["--effort", effort] : [])];
  };
  return {
    newSessionId: async () => randomUUID(),

    interactiveArgs({ purpose, session, access, addDirs }) {
      return [
        "claude",
        ...modelArgs(purpose),
        ...(access === "auto" ? ["--permission-mode", "auto"] : []),
        ...addDirArgs(addDirs),
        ...(session.kind === "resume"
          ? ["--resume", session.id]
          : ["--session-id", session.id, session.prompt]),
      ];
    },

    headlessArgs({ purpose, prompt, access, sessionId, addDirs }) {
      return [
        "claude",
        "-p",
        prompt,
        "--output-format",
        "json",
        ...modelArgs(purpose),
        ...(access === "auto"
          ? ["--permission-mode", "auto"]
          : ["--permission-mode", "dontAsk", "--allowedTools", PORT_ONLY_TOOLS.join(",")]),
        ...(sessionId ? ["--session-id", sessionId] : []),
        ...addDirArgs(addDirs),
      ];
    },
  };
}
