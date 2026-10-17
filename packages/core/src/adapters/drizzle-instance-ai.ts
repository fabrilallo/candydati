import { eq, schema } from '@candydati/db';
import type { InstanceAiRecord, InstanceAiRepository } from '../instance-ai-ports.js';
import type { DbExecutor } from './db-executor.js';

const SLOT = 'instance';

/** Postgres implementation: the single row `slot = 'instance'` of `instance_ai_settings`. */
export function createDrizzleInstanceAi(db: DbExecutor): InstanceAiRepository {
  const table = schema.instanceAiSettings;
  return {
    async find() {
      const [row] = await db.select().from(table).where(eq(table.slot, SLOT)).limit(1);
      if (!row) return null;
      const { slot: _slot, ...record } = row;
      return record;
    },
    async save(record: InstanceAiRecord) {
      const [row] = await db.insert(table).values({ slot: SLOT, ...record }).onConflictDoUpdate({ target: table.slot, set: record }).returning();
      if (!row) throw new Error('instance_ai_settings upsert returned no row');
      return record;
    },
  };
}
