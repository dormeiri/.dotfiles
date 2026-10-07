import type { SessionStage } from "./state.ts";

// What a session is for. Settings map each purpose to the harness and model it runs on.
export type Purpose =
  | SessionStage
  | "createTask"
  | "describeTask"
  | "session"
  | "adr"
  | "rebase"
  | "afkSpec"
  | "afkImpl";

// "auto" lets the agent run tools without asking; "port-only" (headless) may only reach Port.
export type Access = "ask" | "auto";
export type HeadlessAccess = "auto" | "port-only";

export interface AgentLaunch {
  purpose: Purpose;
  cwd: string;
  session: { kind: "fresh"; id: string; prompt: string } | { kind: "resume"; id: string };
  access: Access;
  addDirs: string[];
}

export interface HeadlessLaunch {
  purpose: Purpose;
  cwd: string;
  prompt: string;
  access: HeadlessAccess;
  sessionId?: string;
  addDirs: string[];
}

export interface HeadlessResult {
  ok: boolean;
  // The agent's final reply, else whatever it printed when it failed.
  output: string;
}

export interface Agent {
  // Session IDs are opaque; one is reserved before the session starts so it can be recorded and resumed.
  newSession(purpose: Purpose): Promise<string>;
  interactive(launch: AgentLaunch): Promise<void>;
  headless(launch: HeadlessLaunch): Promise<HeadlessResult>;
}
