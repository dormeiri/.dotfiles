import { spawn } from "node:child_process";
import { closeSync, mkdirSync, openSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { autocomplete, confirm, isCancel, log, select, spinner } from "@clack/prompts";
import type { Config } from "./config.ts";
import type {
  Choice,
  Effects,
  FsProbe,
  GitProbe,
  Logger,
  ProcessRunner,
  Prompts,
} from "./effects.ts";
import { groupedSelect } from "./grouped-select.ts";
import { realAgent } from "./harness/router.ts";
import { entitySearchPath, IN_PROGRESS_PATCH, parsePortTask, taskEntityPath } from "./port.ts";
import { PR_VIEW_FIELDS, parsePrView } from "./pr.ts";
import { capture, failure, foreground } from "./spawn.ts";
import { fileStore, pathExists } from "./store.ts";

const RUNNER_PATH = fileURLToPath(new URL("./setup-runner.ts", import.meta.url));
// Task lists wait on these, so a hanging gh must not hang flow.
const PR_STATUS_TIMEOUT_MS = 10_000;

function processRunner(): ProcessRunner {
  return {
    async searchPortEntities(blueprint, query) {
      const result = await capture([
        "port",
        "api",
        "call",
        "--method",
        "POST",
        entitySearchPath(blueprint),
        "--data",
        JSON.stringify(query),
      ]);
      if (result.exitCode !== 0) throw failure(result);
      return JSON.parse(result.stdout);
    },

    async getPortTask(taskId) {
      const result = await capture(["port", "api", "entities", "get", "task", taskId]);
      if (result.exitCode !== 0) throw failure(result);
      return parsePortTask(taskId, JSON.parse(result.stdout));
    },

    async markPortTaskInProgress(taskId) {
      const result = await capture([
        "port",
        "api",
        "call",
        "--method",
        "PATCH",
        taskEntityPath(taskId),
        "--data",
        JSON.stringify(IN_PROGRESS_PATCH),
      ]);
      if (result.exitCode !== 0) throw failure(result);
    },

    async assume(profile) {
      try {
        const env = { ...process.env, GRANTED_ALIAS_CONFIGURED: "true" };
        return (await foreground(["assume", profile], { env })) === 0;
      } catch {
        return false;
      }
    },

    async runStep({ cmd, cwd, env }) {
      try {
        const proc = Bun.spawn(cmd, {
          cwd,
          env: { ...process.env, ...env },
          stdio: ["ignore", "inherit", "inherit"],
        });
        return await proc.exited;
      } catch (error) {
        console.error(error);
        return 127;
      }
    },

    async prUrl(cwd) {
      const result = await capture(["gh", "pr", "view", "--json", "url", "--jq", ".url"], cwd);
      return (result.exitCode === 0 && result.stdout.trim()) || undefined;
    },

    async prStatus(ref, cwd) {
      const cmd = ["gh", "pr", "view", ref, "--json", PR_VIEW_FIELDS];
      const result = await capture(cmd, cwd, PR_STATUS_TIMEOUT_MS);
      if (result.exitCode !== 0) return undefined;
      try {
        return parsePrView(JSON.parse(result.stdout));
      } catch {
        return undefined;
      }
    },

    async openUrl(url) {
      await capture(["open", url]);
    },

    async editText(initial) {
      const dir = await mkdtemp(join(tmpdir(), "flow-"));
      const file = join(dir, "flow.md");
      try {
        await writeFile(file, initial);
        const editor = process.env.EDITOR || "nvim";
        await foreground(["sh", "-c", `${editor} "$1"`, "sh", file]);
        return await readFile(file, "utf8");
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    },

    spawnSetupRunner(taskId, logPath) {
      mkdirSync(dirname(logPath), { recursive: true });
      const logFd = openSync(logPath, "w");
      // Bun.spawn can't detach; the runner must outlive flow and the terminal it runs in.
      const child = spawn(process.execPath, [RUNNER_PATH, taskId], {
        detached: true,
        stdio: ["ignore", logFd, logFd],
      });
      child.unref();
      closeSync(logFd);
    },

    tailLog(path) {
      const proc = Bun.spawn(["tail", "-n", "20", "-f", path], {
        stdio: ["ignore", "inherit", "inherit"],
      });
      return { stop: () => proc.kill() };
    },

    isAlive(pid) {
      try {
        process.kill(pid, 0);
        return true;
      } catch (error) {
        return (error as NodeJS.ErrnoException).code === "EPERM";
      }
    },
  };
}

const clackPrompts: Prompts = {
  async confirm(message) {
    const answer = await confirm({ message });
    return !isCancel(answer) && answer;
  },
  // clack's option type is conditional on the value type, so prompt over `string` and narrow back.
  async select<T extends string>(message: string, choices: Choice<T>[]) {
    const answer = await select<string>({ message, options: choices });
    return isCancel(answer) ? undefined : (answer as T);
  },
  async filterSelect<T extends string>(message: string, choices: Choice<T>[]) {
    if (choices.some((choice) => choice.group !== undefined))
      return groupedSelect(message, choices);
    const answer = await autocomplete<string>({
      message,
      options: choices,
      placeholder: "Type to filter…",
    });
    return isCancel(answer) ? undefined : (answer as T);
  },
};

const clackLogger: Logger = {
  info: (message) => log.info(message),
  warn: (message) => log.warn(message),
  error: (message) => log.error(message),
  success: (message) => log.success(message),
  message: (message) => log.message(message),
  step: (message) => log.step(message),
  spinner(message) {
    const s = spinner();
    s.start(message);
    return { stop: (done) => s.stop(done), clear: () => s.clear() };
  },
};

const nodeFs: FsProbe = {
  exists: pathExists,
  readText: (path) => readFile(path, "utf8"),
  async ensureDir(path) {
    await mkdir(path, { recursive: true });
  },
};

const gitProbe: GitProbe = {
  async currentBranch(cwd) {
    const result = await capture(["git", "-C", cwd, "rev-parse", "--abbrev-ref", "HEAD"]);
    return result.exitCode === 0 ? result.stdout.trim() : undefined;
  },
  async branchExists(repo, branch) {
    const ref = `refs/heads/${branch}`;
    return (
      (await capture(["git", "-C", repo, "show-ref", "--quiet", "--verify", ref])).exitCode === 0
    );
  },
  async mergeBase(cwd, ref) {
    const result = await capture(["git", "-C", cwd, "merge-base", "HEAD", ref]);
    return result.exitCode === 0 ? result.stdout.trim() : undefined;
  },
};

async function notify(title: string, message: string): Promise<void> {
  await capture([
    "osascript",
    "-e",
    "on run argv",
    "-e",
    "display notification (item 2 of argv) with title (item 1 of argv)",
    "-e",
    "end run",
    title,
    message,
  ]);
}

// A process can't change its parent shell's directory, so the `flow` shell function cds into
// whatever path is left in this file once flow exits.
async function changeDir(path: string): Promise<boolean> {
  const file = process.env.FLOW_CD_FILE;
  if (!file) return false;
  await writeFile(file, path);
  return true;
}

export function realEffects(config: Config): Effects {
  return {
    agent: realAgent(config.agents),
    proc: processRunner(),
    prompts: clackPrompts,
    notify,
    store: fileStore(config.stateDir),
    fs: nodeFs,
    git: gitProbe,
    log: clackLogger,
    sleep: (ms) => Bun.sleep(ms),
    changeDir,
  };
}
