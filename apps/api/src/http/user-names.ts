import { inArray, schema, type Db } from '@tt/db';
import type { UserNames } from './audit-dto.js';

export type UserNameLookup = (userIds: readonly string[]) => Promise<UserNames>;

/** One query for the whole page; users that no longer exist are simply absent. */
export const createUserNameLookup =
  (db: Db): UserNameLookup =>
  async (userIds) => {
    if (userIds.length === 0) return new Map();
    const rows = await db
      .select({ id: schema.user.id, name: schema.user.name })
      .from(schema.user)
      .where(inArray(schema.user.id, [...userIds]));
    return new Map(rows.map((row) => [row.id, row.name]));
  };
