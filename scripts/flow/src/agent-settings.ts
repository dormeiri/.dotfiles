import type { Purpose } from "./agent.ts";

export const HARNESSES = ["claude", "cursor"] as const;
export type HarnessName = (typeof HARNESSES)[number];

export type ClaudeEffort = "low" | "medium" | "high" | "xhigh" | "max";

// Without an effort, Claude's settings pick it for the model.
export interface ClaudeModel {
  model: string;
  effort?: ClaudeEffort;
}

export interface AgentSettings {
  harnessFor: Record<Purpose, HarnessName>;
  claude: Record<Purpose, ClaudeModel>;
  // Cursor model IDs carry the effort (`agent --list-models`).
  cursor: Record<Purpose, string>;
}

const CLAUDE_OPUS: ClaudeModel = { model: "opus" };
const CLAUDE_SONNET: ClaudeModel = { model: "sonnet", effort: "medium" };
const CLAUDE_SONNET_HIGH: ClaudeModel = { model: "sonnet", effort: "high" };

const CURSOR_OPUS = "claude-opus-5-5-medium";
const CURSOR_SONNET = "claude-sonnet-5-5-medium";
const CURSOR_SONNET_HIGH = "claude-sonnet-5-5-high";

export const AGENT_SETTINGS: AgentSettings = {
  harnessFor: {
    research: "claude",
    spec: "claude",
    impl: "cursor",
    review: "cursor",
    docs: "cursor",
    terraform: "cursor",
    announcement: "claude",
    createTask: "claude",
    describeTask: "claude",
    session: "cursor",
    adr: "claude",
    rebase: "cursor",
    afkSpec: "cursor",
    afkImpl: "cursor",
  },
  claude: {
    research: CLAUDE_OPUS,
    spec: CLAUDE_OPUS,
    impl: CLAUDE_OPUS,
    review: CLAUDE_OPUS,
    docs: CLAUDE_SONNET,
    terraform: CLAUDE_SONNET_HIGH,
    announcement: CLAUDE_SONNET,
    createTask: CLAUDE_SONNET,
    describeTask: CLAUDE_SONNET,
    session: CLAUDE_OPUS,
    adr: CLAUDE_SONNET,
    rebase: CLAUDE_SONNET_HIGH,
    afkSpec: CLAUDE_OPUS,
    afkImpl: CLAUDE_OPUS,
  },
  cursor: {
    research: CURSOR_OPUS,
    spec: CURSOR_OPUS,
    impl: CURSOR_OPUS,
    review: CURSOR_OPUS,
    docs: CURSOR_SONNET,
    terraform: CURSOR_SONNET_HIGH,
    announcement: CURSOR_SONNET,
    createTask: CURSOR_SONNET,
    describeTask: CURSOR_SONNET,
    session: CURSOR_OPUS,
    adr: CURSOR_SONNET,
    rebase: CURSOR_SONNET_HIGH,
    afkSpec: CURSOR_OPUS,
    afkImpl: CURSOR_OPUS,
  },
};
