import { homedir } from "node:os";
import { join } from "node:path";

export interface Config {
  mainRepo: string;
  worktreesDir: string;
  pullMiddlewaresScript: string;
  stateDir: string;
}

export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const home = homedir();
  return {
    mainRepo: env.PORT_MONO_DIR ?? join(home, "dev/port-labs/port"),
    worktreesDir: join(home, "dev/worktrees"),
    pullMiddlewaresScript: join(home, "dev/my_scripts/pull-middlewares.sh"),
    stateDir: env.FLOW_STATE_DIR ?? join(env.XDG_STATE_HOME ?? join(home, ".local/state"), "flow"),
  };
}
