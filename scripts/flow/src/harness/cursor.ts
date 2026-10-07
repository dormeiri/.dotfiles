import type { Access, HeadlessAccess, Purpose } from "../agent.ts";
import { addDirArgs, type Harness } from "./harness.ts";

// Cursor can't limit a run to some tools, so port-only just approves the MCP servers (Port's among
// them) and leaves shell commands to the allowlist in ~/.cursor/cli-config.json.
function accessArgs(access: Access | HeadlessAccess): string[] {
  if (access === "auto") return ["--auto-review"];
  return access === "port-only" ? ["--approve-mcps"] : [];
}

// A session ID can't be picked, only created (`agent create-chat`); a fresh session resumes the empty chat.
export function cursorHarness(
  models: Record<Purpose, string>,
  createChat: () => Promise<string>,
): Harness {
  return {
    newSessionId: createChat,

    interactiveArgs({ purpose, session, access, addDirs }) {
      return [
        "agent",
        "--model",
        models[purpose],
        ...accessArgs(access),
        ...addDirArgs(addDirs),
        "--resume",
        session.id,
        ...(session.kind === "fresh" ? [session.prompt] : []),
      ];
    },

    headlessArgs({ purpose, prompt, access, sessionId, addDirs }) {
      return [
        "agent",
        "-p",
        "--output-format",
        "json",
        "--trust",
        "--model",
        models[purpose],
        ...accessArgs(access),
        ...(sessionId ? ["--resume", sessionId] : []),
        ...addDirArgs(addDirs),
        prompt,
      ];
    },
  };
}
