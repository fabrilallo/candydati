import type { Permission } from '@tt/domain';
import { index, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { organization } from './auth.js';

/**
 * Keys for the public API and MCP. Only the sha256 of the secret is stored. The creator is plain text with no foreign
 * key: the key outlives the row but is dead the moment the creator is no longer a member (checked on use).
 * `prefix` is unique across organizations because it is how a presented secret is looked up.
 */
export const apiKey = pgTable(
  'api_key',
  {
    id: text('id').primaryKey(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'restrict' }),
    name: text('name').notNull(),
    prefix: text('prefix').notNull(),
    hash: text('hash').notNull(),
    scopes: text('scopes').array().$type<Permission[]>().notNull(),
    createdBy: text('created_by').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
    /** Every key expires (default 90 days, at most a year); keys older than that rule were backfilled by 0023. */
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (table) => [uniqueIndex('api_key_prefix_idx').on(table.prefix), index('api_key_org_idx').on(table.organizationId)],
);

export type ApiKeyRow = typeof apiKey.$inferSelect;
