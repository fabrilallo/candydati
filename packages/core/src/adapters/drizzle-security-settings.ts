import { eq, schema } from '@tt/db';
import { DEFAULT_SECURITY_SETTINGS, type SecuritySettingsRepository } from '../security-ports.js';
import type { DbExecutor } from './db-executor.js';

export function createDrizzleSecuritySettings(db: DbExecutor): SecuritySettingsRepository {
  const table = schema.organizationSecuritySetting;
  return {
    async get(organizationId) {
      const [row] = await db.select().from(table).where(eq(table.organizationId, organizationId)).limit(1);
      return row ? { requireTwoFactor: row.requireTwoFactor } : DEFAULT_SECURITY_SETTINGS;
    },
    async setRequireTwoFactor(organizationId, value, at) {
      const [row] = await db
        .insert(table)
        .values({ organizationId, requireTwoFactor: value, updatedAt: at })
        .onConflictDoUpdate({ target: table.organizationId, set: { requireTwoFactor: value, updatedAt: at } })
        .returning();
      return { requireTwoFactor: row?.requireTwoFactor ?? value };
    },
  };
}
