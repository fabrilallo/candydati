import { createDrizzleInstanceEmail, type CredentialsBox, type DrizzleUnitOfWork, type InstanceAdmins, type InstanceEmailDeps, type InstanceEmailTester } from '@candydati/core';
import { eq, schema, type Db } from '@candydati/db';
import { createEmailProvider, createEmailRuntime, createSecretBox, INSTANCE_EMAIL_SECRET_INFO, openStoredEmailSettings, type EmailConfig, type EmailRuntime } from '@candydati/providers';
import type { Env } from '../config/env.js';
import { createOrganizationCreationLookups } from '../auth/organization-creation.js';

/** Other api instances and the worker pick a change up within this delay; the instance that saved applies it at once. */
export const EMAIL_SETTINGS_REFRESH_MS = 30_000;

export const createInstanceEmailSecrets = (env: Pick<Env, 'BETTER_AUTH_SECRET'>): CredentialsBox => createSecretBox(env.BETTER_AUTH_SECRET, { info: INSTANCE_EMAIL_SECRET_INFO });

/** The email runtime of a process: EMAIL_PROVIDER from the environment wins, else the settings saved from the app. */
export function createApiEmailRuntime(env: Env, db: Db, log: (line: string) => void): EmailRuntime {
  const repository = createDrizzleInstanceEmail(db);
  const secrets = createInstanceEmailSecrets(env);
  return createEmailRuntime({ env: env.email, load: async () => openStoredEmailSettings(await repository.find(), secrets), log });
}

/** The first owner (recorded by the bootstrap) and the addresses of INSTANCE_ADMIN_EMAILS. */
export function createInstanceAdmins(db: Db, adminEmails: readonly string[]): InstanceAdmins {
  const lookups = createOrganizationCreationLookups(db);
  const emailOf = async (userId: string): Promise<string | null> => {
    const [row] = await db.select({ email: schema.user.email }).from(schema.user).where(eq(schema.user.id, userId)).limit(1);
    return row?.email ?? null;
  };
  return {
    emailOf,
    async isInstanceAdmin(userId) {
      if ((await lookups.firstOwnerId()) === userId) return true;
      const email = await emailOf(userId);
      return email !== null && adminEmails.includes(email.toLowerCase());
    },
  };
}

/** Sends the test email with a transport that is not saved yet; the provider's refusal comes back as its message. */
export const createInstanceEmailTester = (env: EmailConfig, log: (line: string) => void): InstanceEmailTester => ({
  async send(transport, email) {
    const provider = createEmailProvider({ ...env, transport }, log);
    await provider.send({ from: email.from, to: [email.to], subject: email.subject, text: email.text, headers: { 'Auto-Submitted': 'auto-generated' } });
  },
});

export interface InstanceEmailInputs {
  readonly env: Env;
  readonly db: Db;
  readonly uow: DrizzleUnitOfWork;
  readonly runtime: EmailRuntime;
  readonly log: (line: string) => void;
  /** The configured provider by default; a fake in tests. */
  readonly tester?: InstanceEmailTester | undefined;
}

export function createInstanceEmailDeps({ env, db, uow, runtime, log, tester }: InstanceEmailInputs): InstanceEmailDeps {
  const r = uow.repositories;
  return {
    auditLog: r.auditLog,
    transaction: uow.transaction,
    jobTeams: r.jobTeams,
    instanceEmail: createDrizzleInstanceEmail(db),
    emailState: { source: () => runtime.snapshot().source, ready: () => runtime.ready(), refresh: () => runtime.refresh() },
    instanceAdmins: createInstanceAdmins(db, env.INSTANCE_ADMIN_EMAILS),
    emailSecrets: createInstanceEmailSecrets(env),
    emailTester: tester ?? createInstanceEmailTester(env.email, log),
    platformName: env.platform.name,
    now: () => new Date(),
  };
}
