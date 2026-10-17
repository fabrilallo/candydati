import type { InstanceEmailDeps, InstanceEmailRecord, InstanceEmailTransport } from '../instance-email-ports.js';
import { createInMemoryAuditLog, type InMemoryAuditLog } from './in-memory-audit-log.js';
import { cell, createInMemoryTransaction } from './in-memory-transaction.js';

export interface InstanceEmailWorldOptions {
  readonly source?: 'environment' | 'app' | 'none';
  /** The provider refuses the test email with this message. */
  readonly testFails?: string;
  /** The first owner of the instance (user id); `owner` by default. */
  readonly firstOwner?: string;
}

export type InstanceEmailWorld = InstanceEmailDeps & {
  readonly auditLog: InMemoryAuditLog;
  stored(): InstanceEmailRecord | null;
  tests(): readonly { readonly transport: InstanceEmailTransport; readonly email: { readonly from: string; readonly to: string } }[];
  refreshes(): number;
};

/** Instance email deps in memory: a reversible fake seal (never the plaintext), a recording tester, a fixed first owner. */
export function createInstanceEmailWorld(options: InstanceEmailWorldOptions = {}): InstanceEmailWorld {
  const row = cell<InstanceEmailRecord | null>(null);
  const sent = cell<readonly { transport: InstanceEmailTransport; email: { from: string; to: string } }[]>([]);
  let refreshed = 0;
  const source = (): 'environment' | 'app' | 'none' => options.source ?? (row.get() === null ? 'none' : 'app');
  return {
    auditLog: createInMemoryAuditLog(),
    transaction: createInMemoryTransaction(),
    instanceEmail: {
      find: async () => row.get(),
      save: async (record) => {
        row.set(record);
        return record;
      },
    },
    emailState: { source, ready: () => source() !== 'none', refresh: async () => void (refreshed += 1) },
    instanceAdmins: {
      isInstanceAdmin: async (userId) => userId === (options.firstOwner ?? 'owner'),
      emailOf: async (userId) => `${userId}@example.com`,
    },
    emailSecrets: {
      seal: (plaintext, context) => `fake.${context}.${Buffer.from(plaintext).toString('base64')}`,
      open: (envelope, context) => Buffer.from(envelope.replace(`fake.${context}.`, ''), 'base64').toString(),
    },
    emailTester: {
      send: async (transport, email) => {
        if (options.testFails !== undefined) throw new Error(options.testFails);
        sent.set([...sent.get(), { transport, email }]);
      },
    },
    platformName: 'Platform',
    now: () => new Date('2026-10-17T10:00:00Z'),
    stored: () => row.get(),
    tests: () => sent.get(),
    refreshes: () => refreshed,
  };
}
