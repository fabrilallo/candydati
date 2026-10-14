import { boolean, date, index, integer, pgTable, primaryKey, text, timestamp } from 'drizzle-orm/pg-core';
import { organization, user } from './auth.js';

/**
 * Failed password sign-ins, shared by every api instance. One row per counter: `pair:<email>|<ip>` (progressive delay
 * for one client), `email:<email>` (soft throttle of the account) and `known:<email>|<ip>` (an address that signed in
 * successfully, exempt from the account throttle). Holds no password and no session, only counts and times.
 */
export const authThrottle = pgTable(
  'auth_throttle',
  {
    key: text('key').primaryKey(),
    failures: integer('failures').notNull().default(0),
    firstFailureAt: timestamp('first_failure_at', { withTimezone: true }).notNull(),
    lastAt: timestamp('last_at', { withTimezone: true }).notNull(),
    /** When the account owner was last told about failed attempts: at most one notice per window. */
    notifiedAt: timestamp('notified_at', { withTimezone: true }),
  },
  (table) => [index('auth_throttle_last_at_idx').on(table.lastAt)],
);

/**
 * Daily usage counters of paid model calls (MCP tools per key and organization, assistant per user and
 * organization). `scope` says what is counted, `subject` whose counter it is (a key, user or organization id).
 */
export const usageCounter = pgTable(
  'usage_counter',
  {
    scope: text('scope').notNull(),
    subject: text('subject').notNull(),
    day: date('day', { mode: 'string' }).notNull(),
    count: integer('count').notNull().default(0),
  },
  (table) => [primaryKey({ columns: [table.scope, table.subject, table.day] }), index('usage_counter_day_idx').on(table.day)],
);

/** Security settings of an organization. One row per organization, absent means the defaults. */
export const organizationSecuritySetting = pgTable('organization_security_setting', {
  organizationId: text('organization_id')
    .primaryKey()
    .references(() => organization.id, { onDelete: 'restrict' }),
  /** Owners and admins must have two-factor authentication on to use the app. Off by default. */
  requireTwoFactor: boolean('require_two_factor').notNull().default(false),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

/** TOTP secrets and backup codes of Better Auth's two-factor plugin (encrypted by Better Auth with its secret). */
export const twoFactor = pgTable(
  'two_factor',
  {
    id: text('id').primaryKey(),
    secret: text('secret').notNull(),
    backupCodes: text('backup_codes').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    verified: boolean('verified').default(true),
    failedVerificationCount: integer('failed_verification_count').default(0),
    lockedUntil: timestamp('locked_until'),
  },
  (table) => [index('two_factor_secret_idx').on(table.secret), index('two_factor_user_id_idx').on(table.userId)],
);

export type OrganizationSecuritySettingRow = typeof organizationSecuritySetting.$inferSelect;

/**
 * The bootstrap of an instance in `invite_only` mode: the address that holds the single "first owner" sign-up. Claimed
 * under an advisory lock, so two concurrent first sign-ups cannot both get through; a claim that was never confirmed
 * lapses after the verification link's lifetime. One row at most (`slot = 'first_owner'`).
 */
export const instanceBootstrap = pgTable('instance_bootstrap', {
  slot: text('slot').primaryKey(),
  email: text('email').notNull(),
  claimedAt: timestamp('claimed_at', { withTimezone: true }).notNull(),
});
