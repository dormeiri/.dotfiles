import { describe, expect, test } from "bun:test";
import type { AgentLaunch, HeadlessLaunch } from "../src/agent.ts";
import { AGENT_SETTINGS, type AgentSettings } from "../src/agent-settings.ts";
import { claudeHarness, PORT_ONLY_TOOLS } from "../src/harness/claude.ts";
import { cursorHarness } from "../src/harness/cursor.ts";
import { resultText } from "../src/harness/harness.ts";
import { routedAgent } from "../src/harness/router.ts";

const claudeModels = {
  ...AGENT_SETTINGS.claude,
  impl: { model: "opus", effort: "max" as const },
  adr: { model: "sonnet" },
};
const cursorModels = { ...AGENT_SETTINGS.cursor, impl: "claude-opus-5-5-max" };

const fresh = (overrides: Partial<AgentLaunch> = {}): AgentLaunch => ({
  purpose: "impl",
  cwd: "/wt",
  session: { kind: "fresh", id: "s1", prompt: "/implement spec.md" },
  access: "auto",
  addDirs: ["/scratch"],
  ...overrides,
});

const headless = (overrides: Partial<HeadlessLaunch> = {}): HeadlessLaunch => ({
  purpose: "createTask",
  cwd: "/repo",
  prompt: "/create-task idea",
  access: "port-only",
  addDirs: [],
  ...overrides,
});

describe("claude", () => {
  const claude = claudeHarness(claudeModels);

  test("a fresh session picks its ID, the purpose's model and effort, and auto permissions", () => {
    expect(claude.interactiveArgs(fresh())).toEqual([
      "claude",
      "--model",
      "opus",
      "--effort",
      "max",
      "--permission-mode",
      "auto",
      "--add-dir",
      "/scratch",
      "--session-id",
      "s1",
      "/implement spec.md",
    ]);
  });

  test("resuming keeps the model; asking leaves permissions to Claude's settings", () => {
    const launch = fresh({ purpose: "adr", access: "ask", session: { kind: "resume", id: "s1" } });
    expect(claude.interactiveArgs(launch)).toEqual([
      "claude",
      "--model",
      "sonnet",
      "--add-dir",
      "/scratch",
      "--resume",
      "s1",
    ]);
  });

  test("port-only headless runs may only use Port's tools", () => {
    const args = claude.headlessArgs(headless());
    expect(args.slice(0, 5)).toEqual([
      "claude",
      "-p",
      "/create-task idea",
      "--output-format",
      "json",
    ]);
    expect(args).toContain("dontAsk");
    expect(args[args.indexOf("--allowedTools") + 1]).toBe(PORT_ONLY_TOOLS.join(","));
    expect(PORT_ONLY_TOOLS.every((tool) => /port/i.test(tool))).toBe(true);
  });

  test("auto headless runs record their session", () => {
    const args = claude.headlessArgs(
      headless({ purpose: "afkImpl", access: "auto", sessionId: "s2" }),
    );
    expect(args).not.toContain("--allowedTools");
    expect(args).toContain("auto");
    expect(args.slice(-2)).toEqual(["--session-id", "s2"]);
  });
});

describe("cursor", () => {
  const cursor = cursorHarness(cursorModels, async () => "chat-1");

  test("session IDs are created chats", async () => {
    expect(await cursor.newSessionId()).toBe("chat-1");
  });

  test("a fresh session resumes its empty chat with the prompt", () => {
    expect(cursor.interactiveArgs(fresh())).toEqual([
      "agent",
      "--model",
      "claude-opus-5-5-max",
      "--auto-review",
      "--add-dir",
      "/scratch",
      "--resume",
      "s1",
      "/implement spec.md",
    ]);
  });

  test("resuming sends no prompt; asking adds no permission flag", () => {
    const launch = fresh({ access: "ask", session: { kind: "resume", id: "s1" }, addDirs: [] });
    expect(cursor.interactiveArgs(launch)).toEqual([
      "agent",
      "--model",
      "claude-opus-5-5-max",
      "--resume",
      "s1",
    ]);
  });

  test("headless runs print JSON in a trusted workspace, the prompt last", () => {
    expect(cursor.headlessArgs(headless())).toEqual([
      "agent",
      "-p",
      "--output-format",
      "json",
      "--trust",
      "--model",
      AGENT_SETTINGS.cursor.createTask,
      "--approve-mcps",
      "/create-task idea",
    ]);
  });
});

describe("router", () => {
  function setup(harnessFor: Partial<AgentSettings["harnessFor"]> = {}) {
    const runs: { argv: string[]; cwd: string }[] = [];
    const harness = (name: string) => ({
      newSessionId: async () => `${name}-id`,
      interactiveArgs: (launch: AgentLaunch) => [name, launch.purpose, launch.session.id],
      headlessArgs: (launch: HeadlessLaunch) => [name, launch.purpose, launch.sessionId ?? "-"],
    });
    const agent = routedAgent(
      { ...AGENT_SETTINGS, harnessFor: { ...AGENT_SETTINGS.harnessFor, ...harnessFor } },
      { claude: harness("claude"), cursor: harness("cursor") },
      {
        async interactive(argv, cwd) {
          runs.push({ argv, cwd });
        },
        async capture(argv, cwd) {
          runs.push({ argv, cwd });
          return { exitCode: 0, stdout: JSON.stringify({ result: " done " }), stderr: "" };
        },
      },
    );
    return { agent, runs };
  }

  test("new sessions go to the purpose's harness", async () => {
    const { agent } = setup({ impl: "cursor", adr: "claude" });
    expect(await agent.newSession("impl")).toBe("cursor:cursor-id");
    expect(await agent.newSession("adr")).toBe("claude:claude-id");
  });

  test("a session resumes on the harness that started it, whatever the settings say now", async () => {
    const { agent, runs } = setup({ impl: "cursor" });
    await agent.interactive(fresh({ session: { kind: "resume", id: "claude:abc" } }));
    expect(runs).toEqual([{ argv: ["claude", "impl", "abc"], cwd: "/wt" }]);
  });

  test("headless runs without a session use the purpose's harness and return the reply", async () => {
    const { agent, runs } = setup({ createTask: "cursor" });
    expect(await agent.headless(headless())).toEqual({ ok: true, output: "done" });
    expect(runs[0]?.argv).toEqual(["cursor", "createTask", "-"]);
  });

  test("rejects session IDs it didn't hand out", async () => {
    const { agent } = setup();
    await expect(
      agent.interactive(fresh({ session: { kind: "resume", id: "abc" } })),
    ).rejects.toThrow("isn't a session ID flow recorded");
  });
});

describe("resultText", () => {
  test("unwraps the result of --output-format json", () => {
    const stdout = JSON.stringify({ type: "result", result: "hello\nTASK_ID: task_1" });
    expect(resultText(stdout)).toBe("hello\nTASK_ID: task_1");
  });

  test("falls back to the raw output when it isn't JSON", () => {
    expect(resultText("Error: not logged in")).toBe("Error: not logged in");
  });
});
