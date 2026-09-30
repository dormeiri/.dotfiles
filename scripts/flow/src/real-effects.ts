import { spawn } from "node:child_process";
import { closeSync, mkdirSync, openSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { autocomplete, confirm, isCancel, log, select, spinner } from "@clack/prompts";
import { z } from "zod";
import type { Config } from "./config.ts";
import type {
  Choice,
  Effects,
  FsProbe,
  GitProbe,
  Logger,
  ProcessRunner,
  ProcResult,
  Prompts,
} from "./effects.ts";
import { fileStore, pathExists } from "./store.ts";

const RUNNER_PATH = fileURLToPath(new URL("./setup-runner.ts", import.meta.url));

async function capture(cmd: string[], cwd?: string): Promise<ProcResult> {
  const proc = Bun.spawn(cmd, { cwd, stdin: "ignore", stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { exitCode, stdout, stderr };
}

// Ctrl-C in an interactive child also reaches flow (same process group); flow has to survive it
// to run the stage's completion check once the child exits.
async function withSigintIgnored<T>(run: () => Promise<T>): Promise<T> {
  const ignore = () => {};
  process.on("SIGINT", ignore);
  try {
    return await run();
  } finally {
    process.off("SIGINT", ignore);
  }
}

function foreground(
  cmd: string[],
  opts: { cwd?: string; env?: Record<string, string | undefined> } = {},
) {
  return withSigintIgnored(
    () => Bun.spawn(cmd, { ...opts, stdio: ["inherit", "inherit", "inherit"] }).exited,
  );
}

function failure(result: ProcResult): Error {
  return new Error(result.stderr.trim() || result.stdout.trim());
}

const portEntitySchema = z.object({
  title: z.string().nullish(),
  properties: z
    .object({ description: z.string().nullish(), branch_name: z.string().nullish() })
    .nullish(),
});

function processRunner(config: Config): ProcessRunner {
  return {
    claudeHeadless: ({ cwd, prompt, allowedTools }) =>
      capture(
        [
          "claude",
          "-p",
          prompt,
          "--output-format",
          "json",
          "--permission-mode",
          "dontAsk",
          "--allowedTools",
          allowedTools.join(","),
        ],
        cwd,
      ),

    async claudeInteractive({ cwd, session, permissionMode, addDirs }) {
      const args = ["claude"];
      if (permissionMode) args.push("--permission-mode", permissionMode);
      for (const dir of addDirs) args.push("--add-dir", dir);
      if (session.kind === "resume") args.push("--resume", session.id);
      else args.push("--session-id", session.id, session.prompt);
      await foreground(args, { cwd });
    },

    async pickPortTask() {
      const proc = Bun.spawn([config.taskPickerScript, "--only-branch-name"], {
        stdio: ["inherit", "pipe", "inherit"],
      });
      const [stdout, exitCode] = await withSigintIgnored(() =>
        Promise.all([new Response(proc.stdout).text(), proc.exited]),
      );
      // mt.sh prints "<branch>\t<task id>".
      return exitCode === 0 ? stdout.trim().split("\t")[1] || undefined : undefined;
    },

    async getPortTask(taskId) {
      const result = await capture(["port", "api", "entities", "get", "task", taskId]);
      if (result.exitCode !== 0) throw failure(result);
      const entity = portEntitySchema.parse(JSON.parse(result.stdout));
      return {
        title: entity.title ?? taskId,
        description: entity.properties?.description ?? "",
        branch: entity.properties?.branch_name || undefined,
      };
    },

    async markPortTaskInProgress(taskId) {
      const result = await capture([
        "port",
        "api",
        "call",
        "--method",
        "PATCH",
        `/blueprints/task/entities/${taskId}`,
        "--data",
        JSON.stringify({ properties: { status: "In progress" } }),
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
  spinner(message) {
    const s = spinner();
    s.start(message);
    return { stop: (done) => s.stop(done) };
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

export function realEffects(config: Config): Effects {
  return {
    proc: processRunner(config),
    prompts: clackPrompts,
    notify,
    store: fileStore(config.stateDir),
    fs: nodeFs,
    git: gitProbe,
    log: clackLogger,
    sleep: (ms) => Bun.sleep(ms),
  };
}
