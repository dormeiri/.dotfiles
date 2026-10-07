import { homedir } from "node:os";
import { join } from "node:path";
import { AGENT_SETTINGS, type AgentSettings } from "./agent-settings.ts";
import type { CompanionStage } from "./state.ts";

export interface Config {
  mainRepo: string;
  companionRepos: Record<CompanionStage, string>;
  worktreesDir: string;
  pullMiddlewaresScript: string;
  stateDir: string;
  // The Port team whose current iteration new tasks go into.
  portTeam: string;
  agents: AgentSettings;
}

export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const home = homedir();
  return {
    mainRepo: env.PORT_MONO_DIR ?? join(home, "dev/port-labs/port"),
    companionRepos: {
      docs: env.PORT_DOCS_DIR ?? join(home, "dev/port-labs/port-docs"),
      terraform: env.PORT_TERRAFORM_DIR ?? join(home, "dev/port-labs/terraform-provider-port-labs"),
    },
    worktreesDir: join(home, "dev/worktrees"),
    pullMiddlewaresScript: join(home, "dev/my_scripts/pull-middlewares.sh"),
    stateDir: env.FLOW_STATE_DIR ?? join(env.XDG_STATE_HOME ?? join(home, ".local/state"), "flow"),
    portTeam: env.FLOW_PORT_TEAM ?? "workflows_team",
    agents: AGENT_SETTINGS,
  };
}
