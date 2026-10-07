import type { Agent } from "../agent.ts";
import { type AgentSettings, HARNESSES, type HarnessName } from "../agent-settings.ts";
import type { ProcResult } from "../effects.ts";
import { capture, failure, foreground } from "../spawn.ts";
import { claudeHarness } from "./claude.ts";
import { cursorHarness } from "./cursor.ts";
import { type Harness, resultText } from "./harness.ts";

export interface CliRunner {
  interactive(argv: string[], cwd: string): Promise<void>;
  capture(argv: string[], cwd: string): Promise<ProcResult>;
}

// Session IDs are `<harness>:<its ID>`, so a session resumes on the harness that started it even
// after the settings change.
function parseSessionId(id: string): [HarnessName, string] {
  const at = id.indexOf(":");
  const name = HARNESSES.find((harness) => harness === id.slice(0, at));
  if (!name) throw new Error(`'${id}' isn't a session ID flow recorded.`);
  return [name, id.slice(at + 1)];
}

export function routedAgent(
  settings: AgentSettings,
  harnesses: Record<HarnessName, Harness>,
  run: CliRunner,
): Agent {
  return {
    async newSession(purpose) {
      const name = settings.harnessFor[purpose];
      return `${name}:${await harnesses[name].newSessionId()}`;
    },

    async interactive(launch) {
      const [name, id] = parseSessionId(launch.session.id);
      const argv = harnesses[name].interactiveArgs({
        ...launch,
        session: { ...launch.session, id },
      });
      await run.interactive(argv, launch.cwd);
    },

    async headless(launch) {
      const [name, sessionId] = launch.sessionId
        ? parseSessionId(launch.sessionId)
        : [settings.harnessFor[launch.purpose], undefined];
      const result = await run.capture(
        harnesses[name].headlessArgs({ ...launch, sessionId }),
        launch.cwd,
      );
      return {
        ok: result.exitCode === 0,
        output: resultText(result.stdout).trim() || result.stderr.trim(),
      };
    },
  };
}

async function createCursorChat(): Promise<string> {
  const result = await capture(["agent", "create-chat"]);
  if (result.exitCode !== 0) throw failure(result);
  return result.stdout.trim();
}

export function realAgent(settings: AgentSettings): Agent {
  return routedAgent(
    settings,
    {
      claude: claudeHarness(settings.claude),
      cursor: cursorHarness(settings.cursor, createCursorChat),
    },
    {
      async interactive(argv, cwd) {
        await foreground(argv, { cwd });
      },
      capture: (argv, cwd) => capture(argv, cwd),
    },
  );
}
