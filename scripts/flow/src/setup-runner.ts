#!/usr/bin/env bun
// Spawned detached by `flow new`; its stdout/stderr are the task's setup log.
import { loadConfig } from "./config.ts";
import { errorMessage } from "./errors.ts";
import { realEffects } from "./real-effects.ts";
import { runSetup } from "./setup.ts";

const taskId = process.argv[2];
if (!taskId) {
  console.error("usage: setup-runner.ts <task-id>");
  process.exit(1);
}

const fx = realEffects(loadConfig());
try {
  await runSetup(fx, taskId, process.pid);
} catch (error) {
  console.error(error);
  await fx.notify(`flow · ${taskId}`, `Setup runner crashed: ${errorMessage(error)}`);
  process.exit(1);
}
