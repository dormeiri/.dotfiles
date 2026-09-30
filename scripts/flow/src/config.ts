import { homedir } from "node:os";
import { dirname, join } from "node:path";

export interface Config {
  mainRepo: string;
  wtapPath: string;
  mtPath: string;
  stateDir: string;
}

export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const home = homedir();
  const portfileDir = env.PORTFILE_DIR ?? join(home, "dev/dormeiri-port/.portfile");
  const wtapPath = env.FLOW_WTAP_PATH ?? join(portfileDir, "wtap.sh");
  return {
    mainRepo: env.PORT_MONO_DIR ?? join(home, "dev/port-labs/port"),
    wtapPath,
    mtPath: join(dirname(wtapPath), "mt.sh"),
    stateDir: env.FLOW_STATE_DIR ?? join(env.XDG_STATE_HOME ?? join(home, ".local/state"), "flow"),
  };
}
