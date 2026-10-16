import { eq, schema } from '@candydati/db';
import type { EmailSettingsRepository } from '../messaging-ports.js';
import type { DbExecutor } from './db-executor.js';

/** Postgres implementation: one row per organization, keyed by it. */
export function createDrizzleEmailSettings(db: DbExecutor): EmailSettingsRepository {
  const { emailSettings } = schema;
  return {
    async find(organizationId) {
      const [row] = await db.select().from(emailSettings).where(eq(emailSettings.organizationId, organizationId)).limit(1);
      return row ?? null;
    },
    async save(settings) {
      const { organizationId: _organizationId, ...fields } = settings;
      const [row] = await db.insert(emailSettings).values(settings).onConflictDoUpdate({ target: emailSettings.organizationId, set: fields }).returning();
      if (!row) throw new Error('email_settings upsert returned no row');
      return row;
    },
  };
}
