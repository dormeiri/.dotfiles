import { homedir } from "node:os";
import { join } from "node:path";

export interface Config {
  mainRepo: string;
  worktreesDir: string;
  taskPickerScript: string;
  pullMiddlewaresScript: string;
  stateDir: string;
}

export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const home = homedir();
  const portfileDir = env.PORTFILE_DIR ?? join(home, "dev/dormeiri-port/.portfile");
  return {
    mainRepo: env.PORT_MONO_DIR ?? join(home, "dev/port-labs/port"),
    worktreesDir: join(home, "dev/worktrees"),
    taskPickerScript: join(portfileDir, "mt.sh"),
    pullMiddlewaresScript: join(home, "dev/my_scripts/pull-middlewares.sh"),
    stateDir: env.FLOW_STATE_DIR ?? join(env.XDG_STATE_HOME ?? join(home, ".local/state"), "flow"),
  };
}
