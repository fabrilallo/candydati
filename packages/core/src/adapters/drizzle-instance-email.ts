import { eq, schema } from '@candydati/db';
import type { InstanceEmailRecord, InstanceEmailRepository } from '../instance-email-ports.js';
import type { DbExecutor } from './db-executor.js';

const SLOT = 'instance';

/** Postgres implementation: the single row `slot = 'instance'` of `instance_email_settings`. */
export function createDrizzleInstanceEmail(db: DbExecutor): InstanceEmailRepository {
  const table = schema.instanceEmailSettings;
  return {
    async find() {
      const [row] = await db.select().from(table).where(eq(table.slot, SLOT)).limit(1);
      if (!row) return null;
      const { slot: _slot, provider, ...fields } = row;
      return { ...fields, provider: provider === 'resend' ? 'resend' : 'smtp' };
    },
    async save(record: InstanceEmailRecord) {
      const [row] = await db.insert(table).values({ slot: SLOT, ...record }).onConflictDoUpdate({ target: table.slot, set: record }).returning();
      if (!row) throw new Error('instance_email_settings upsert returned no row');
      return record;
    },
  };
}
