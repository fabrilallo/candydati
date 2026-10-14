import { eq, schema } from '@tt/db';
import type { TwoFactorLookup } from '../security-ports.js';
import type { DbExecutor } from './db-executor.js';

/** Reads Better Auth's `user.two_factor_enabled`: an unknown person has no 2FA. */
export function createDrizzleTwoFactor(db: DbExecutor): TwoFactorLookup {
  return {
    async enabled(userId) {
      const [row] = await db.select({ enabled: schema.user.twoFactorEnabled }).from(schema.user).where(eq(schema.user.id, userId)).limit(1);
      return row?.enabled === true;
    },
  };
}
