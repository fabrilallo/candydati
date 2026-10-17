import { createDrizzleInstanceEmail } from '@candydati/core';
import type { Db } from '@candydati/db';
import { createEmailRuntime, createSecretBox, INSTANCE_EMAIL_SECRET_INFO, openStoredEmailSettings, type EmailRuntime } from '@candydati/providers';
import type { WorkerEnv } from '../config/env.js';

/** A change saved from the app (on the api) reaches the worker within this delay. */
export const EMAIL_SETTINGS_REFRESH_MS = 30_000;

/**
 * The email settings of the worker: EMAIL_PROVIDER from the environment wins, else the settings saved from the app,
 * read now and then every EMAIL_SETTINGS_REFRESH_MS. `stop` clears the timer on shutdown.
 */
export async function startWorkerEmailRuntime(env: WorkerEnv, db: Db, log: (line: string) => void): Promise<{ readonly runtime: EmailRuntime; stop(): void }> {
  const repository = createDrizzleInstanceEmail(db);
  const secrets = createSecretBox(env.BETTER_AUTH_SECRET, { info: INSTANCE_EMAIL_SECRET_INFO });
  const runtime = createEmailRuntime({ env: env.email, load: async () => openStoredEmailSettings(await repository.find(), secrets), log });
  await runtime.refresh();
  const timer = setInterval(() => void runtime.refresh(), EMAIL_SETTINGS_REFRESH_MS);
  timer.unref();
  return { runtime, stop: () => clearInterval(timer) };
}
