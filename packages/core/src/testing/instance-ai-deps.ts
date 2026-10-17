import type { InstanceAiDeps, InstanceAiRecord } from '../instance-ai-ports.js';
import { createInMemoryAuditLog, type InMemoryAuditLog } from './in-memory-audit-log.js';
import { cell, createInMemoryTransaction } from './in-memory-transaction.js';

export interface InstanceAiWorldOptions {
  /** The models are set by the environment (`provider/model`, null: off). */
  readonly environment?: { readonly assistant: string | null; readonly fast: string | null };
  /** This model name refuses the test call with "model not found". */
  readonly refuse?: string;
}

export type InstanceAiWorld = InstanceAiDeps & {
  readonly auditLog: InMemoryAuditLog;
  stored(): InstanceAiRecord | null;
  checked(): readonly { readonly id: string; readonly apiKey: string }[];
  refreshes(): number;
};

/** Instance AI deps in memory: a reversible fake seal (never the plaintext), a recording model check, the runtime from the row. */
export function createInstanceAiWorld(options: InstanceAiWorldOptions = {}): InstanceAiWorld {
  const row = cell<InstanceAiRecord | null>(null);
  const calls = cell<readonly { id: string; apiKey: string }[]>([]);
  let refreshed = 0;
  const onIf = (record: InstanceAiRecord | null, provider: string | null, name: string | null) => (record && provider !== null && name !== null && record.keysCiphertext !== null ? `${provider}/${name}` : null);
  return {
    auditLog: createInMemoryAuditLog(),
    transaction: createInMemoryTransaction(),
    instanceAi: { find: async () => row.get(), save: async (record) => (row.set(record), record) },
    aiState: {
      snapshot: () => {
        if (options.environment) return { source: 'environment', ...options.environment };
        const record = row.get();
        return { source: record ? 'app' : 'none', assistant: onIf(record, record?.assistantProvider ?? null, record?.assistantModel ?? null), fast: onIf(record, record?.fastProvider ?? null, record?.fastModel ?? null) };
      },
      refresh: async () => void (refreshed += 1),
    },
    instanceAdmins: { isInstanceAdmin: async (userId) => userId === 'owner', emailOf: async (userId) => `${userId}@example.com` },
    aiSecrets: {
      seal: (plaintext, context) => `fake.${context}.${Buffer.from(plaintext).toString('base64')}`,
      open: (envelope, context) => Buffer.from(envelope.replace(`fake.${context}.`, ''), 'base64').toString(),
    },
    aiCheck: {
      check: async (model) => {
        if (options.refuse !== undefined && model.id.endsWith(`/${options.refuse}`)) throw new Error('model not found');
        calls.set([...calls.get(), model]);
      },
    },
    now: () => new Date('2026-10-17T10:00:00Z'),
    stored: () => row.get(),
    checked: () => calls.get(),
    refreshes: () => refreshed,
  };
}
