import type { ProcResult } from "./effects.ts";

export async function capture(cmd: string[], cwd?: string, timeout?: number): Promise<ProcResult> {
  const proc = Bun.spawn(cmd, { cwd, timeout, stdin: "ignore", stdout: "pipe", stderr: "pipe" });
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

export function foreground(
  cmd: string[],
  opts: { cwd?: string; env?: Record<string, string | undefined> } = {},
) {
  return withSigintIgnored(
    () => Bun.spawn(cmd, { ...opts, stdio: ["inherit", "inherit", "inherit"] }).exited,
  );
}

export function failure(result: ProcResult): Error {
  return new Error(result.stderr.trim() || result.stdout.trim());
}
