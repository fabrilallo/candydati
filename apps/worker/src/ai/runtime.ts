import { createDrizzleInstanceAi } from '@candydati/core';
import type { Db } from '@candydati/db';
import { createAiRuntime, createSecretBox, INSTANCE_AI_SECRET_INFO, openStoredAiSettings, type AiRuntime } from '@candydati/providers';
import type { WorkerEnv } from '../config/env.js';
import { EMAIL_SETTINGS_REFRESH_MS } from '../email/runtime.js';

/**
 * The AI settings of the worker (the fast model for CV reading): FAST_MODEL from the environment wins, else the
 * settings saved from the app, read now and then every EMAIL_SETTINGS_REFRESH_MS. `stop` clears the timer.
 */
export async function startWorkerAiRuntime(env: WorkerEnv, db: Db, log: (line: string) => void): Promise<{ readonly runtime: AiRuntime; stop(): void }> {
  const repository = createDrizzleInstanceAi(db);
  const secrets = createSecretBox(env.BETTER_AUTH_SECRET, { info: INSTANCE_AI_SECRET_INFO });
  const runtime = createAiRuntime({ env: { fastModel: env.FAST_MODEL, keys: process.env }, load: async () => openStoredAiSettings(await repository.find(), secrets), log });
  await runtime.refresh();
  const timer = setInterval(() => void runtime.refresh(), EMAIL_SETTINGS_REFRESH_MS);
  timer.unref();
  return { runtime, stop: () => clearInterval(timer) };
}
