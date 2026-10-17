import { createDrizzleInstanceAi, type AiModelCheck, type DrizzleUnitOfWork, type InstanceAiDeps } from '@candydati/core';
import type { Db } from '@candydati/db';
import { checkAiModel, createAiRuntime, createSecretBox, INSTANCE_AI_SECRET_INFO, openStoredAiSettings, type AiRuntime } from '@candydati/providers';
import type { Env } from '../config/env.js';
import { createInstanceAdmins } from './instance-email-deps.js';

/** The AI runtime of the api: AGENT_MODEL or FAST_MODEL from the environment win, else the settings saved from the app. */
export function createApiAiRuntime(env: Env, db: Db, log: (line: string) => void): AiRuntime {
  const repository = createDrizzleInstanceAi(db);
  const secrets = createSecretBox(env.BETTER_AUTH_SECRET, { info: INSTANCE_AI_SECRET_INFO });
  return createAiRuntime({
    env: { agentModel: env.AGENT_MODEL, fastModel: env.FAST_MODEL, keys: process.env },
    load: async () => openStoredAiSettings(await repository.find(), secrets),
    log,
  });
}

export interface InstanceAiInputs {
  readonly env: Env;
  readonly db: Db;
  readonly uow: DrizzleUnitOfWork;
  readonly runtime: AiRuntime;
  /** The real test call by default; a fake in tests. */
  readonly check?: AiModelCheck | undefined;
}

export function createInstanceAiDeps({ env, db, uow, runtime, check }: InstanceAiInputs): InstanceAiDeps {
  const r = uow.repositories;
  return {
    auditLog: r.auditLog,
    transaction: uow.transaction,
    jobTeams: r.jobTeams,
    instanceAi: createDrizzleInstanceAi(db),
    aiState: {
      snapshot: () => {
        const { source, assistant, fast } = runtime.snapshot();
        return { source, assistant: assistant?.id ?? null, fast: fast?.id ?? null };
      },
      refresh: () => runtime.refresh(),
    },
    instanceAdmins: createInstanceAdmins(db, env.INSTANCE_ADMIN_EMAILS),
    aiSecrets: createSecretBox(env.BETTER_AUTH_SECRET, { info: INSTANCE_AI_SECRET_INFO }),
    aiCheck: check ?? { check: checkAiModel },
    now: () => new Date(),
  };
}
