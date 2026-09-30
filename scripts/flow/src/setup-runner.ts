#!/usr/bin/env bun
// Spawned detached by flow so setup outlives it; stdout/stderr are the task's setup log.
import { loadConfig } from "./config.ts";
import { errorMessage } from "./errors.ts";
import { realEffects } from "./real-effects.ts";
import { notificationTitle, runSetup } from "./setup.ts";

const taskId = process.argv[2];
if (!taskId) {
  console.error("usage: setup-runner.ts <task-id>");
  process.exit(1);
}

const config = loadConfig();
const fx = realEffects(config);
try {
  await runSetup(fx, config, taskId, process.pid);
} catch (error) {
  console.error(error);
  await fx.notify(notificationTitle(taskId), `Setup runner crashed: ${errorMessage(error)}`);
  process.exit(1);
}
