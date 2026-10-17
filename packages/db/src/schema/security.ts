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
  /** The account that confirmed its address while holding the live claim: the first owner of the instance. */
  ownerUserId: text('owner_user_id').references(() => user.id, { onDelete: 'set null' }),
});

/**
 * Organizations created per account, for ORGANIZATION_CREATION=one_per_user: one row per account that ever created one
 * (or is creating one right now). The row is claimed before the organization exists, so of concurrent creations exactly
 * one wins; it outlives the owner role, so demoting oneself frees nothing. `organization_id` stays null until the
 * organization is created: a claim whose creation failed lapses after a few minutes.
 */
export const organizationCreationQuota = pgTable('organization_creation_quota', {
  userId: text('user_id')
    .primaryKey()
    .references(() => user.id, { onDelete: 'cascade' }),
  organizationId: text('organization_id').references(() => organization.id, { onDelete: 'restrict' }),
  claimedAt: timestamp('claimed_at', { withTimezone: true }).notNull(),
});

/**
 * How the instance sends email when the environment does not say (EMAIL_PROVIDER unset): configured from the app by the
 * first owner or an instance admin, saved only after a test email went through. One row at most (`slot = 'instance'`).
 * The SMTP password or the Resend API key is sealed with the secret box (BETTER_AUTH_SECRET, info
 * `candydati:instance-email`); everything else is plain configuration.
 */
export const instanceEmailSettings = pgTable('instance_email_settings', {
  slot: text('slot').primaryKey(),
  provider: text('provider').notNull(),
  smtpHost: text('smtp_host'),
  smtpPort: integer('smtp_port'),
  smtpSecure: boolean('smtp_secure').notNull().default(false),
  smtpUser: text('smtp_user'),
  /** `sb1.` envelope of the SMTP password or the Resend API key; null when the provider needs none. */
  secretCiphertext: text('secret_ciphertext'),
  sendingDomain: text('sending_domain').notNull(),
  fromLocal: text('from_local').notNull(),
  verifiedAt: timestamp('verified_at', { withTimezone: true }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
  updatedBy: text('updated_by').references(() => user.id, { onDelete: 'set null' }),
});

export type InstanceEmailSettingsRow = typeof instanceEmailSettings.$inferSelect;

/**
 * The instance's AI models when the environment does not set them (AGENT_MODEL and FAST_MODEL unset): one provider,
 * its key sealed with the secret box (BETTER_AUTH_SECRET, info `candydati:instance-ai`), the assistant model and the
 * fast model by name (null: switched off). Saved only after each chosen model answered a test call. One row at most.
 */
export const instanceAiSettings = pgTable('instance_ai_settings', {
  slot: text('slot').primaryKey(),
  provider: text('provider').notNull(),
  secretCiphertext: text('secret_ciphertext'),
  assistantModel: text('assistant_model'),
  fastModel: text('fast_model'),
  verifiedAt: timestamp('verified_at', { withTimezone: true }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
  updatedBy: text('updated_by').references(() => user.id, { onDelete: 'set null' }),
});

export type InstanceAiSettingsRow = typeof instanceAiSettings.$inferSelect;
