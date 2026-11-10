import { sql } from 'drizzle-orm';
import { index, integer, jsonb, pgTable, primaryKey, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { organization } from './auth.js';
import { job } from './job.js';

const organizationRef = () =>
  text('organization_id')
    .notNull()
    .references(() => organization.id, { onDelete: 'restrict' });

/**
 * Unused since external sourcing was removed before release, like every table in this file: people once found outside
 * the organization for a job. Migration 0056 erased the rows; the tables stay for the previous release's replicas during
 * the deploy and are dropped in a later release (MIGRATIONS.md rule 1).
 */
export const sourcedContact = pgTable(
  'sourced_contact',
  {
    id: text('id').primaryKey(),
    organizationId: organizationRef(),
    jobId: text('job_id')
      .notNull()
      .references(() => job.id, { onDelete: 'restrict' }),
    firstName: text('first_name').notNull(),
    lastName: text('last_name'),
    headline: text('headline'),
    location: text('location'),
    source: text('source').notNull(),
    profileUrl: text('profile_url').notNull(),
    profileKey: text('profile_key').notNull(),
    email: text('email'),
    evidence: jsonb('evidence').$type<unknown[]>().notNull().default(sql`'[]'::jsonb`),
    status: text('status').notNull().default('found'),
    /** Hash of the personal notice link's secret (only the person's notice carries the secret). */
    noticeTokenHash: text('notice_token_hash').notNull(),
    noticeSentAt: timestamp('notice_sent_at', { withTimezone: true }),
    contactedAt: timestamp('contacted_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdBy: text('created_by').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('sourced_contact_job_profile_uidx').on(table.organizationId, table.jobId, table.profileKey),
    index('sourced_contact_org_profile_idx').on(table.organizationId, table.profileKey),
    uniqueIndex('sourced_contact_notice_uidx').on(table.noticeTokenHash),
    // Backs the daily erasure across organizations.
    index('sourced_contact_expires_idx').on(table.expiresAt),
  ],
);

/** Unused (see above): keyed hashes of the people who had asked not to be contacted. */
export const sourcingObjection = pgTable(
  'sourcing_objection',
  {
    organizationId: organizationRef(),
    fingerprint: text('fingerprint').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [primaryKey({ columns: [table.organizationId, table.fingerprint] })],
);

/** Unused (see above): who had accepted the risk of the extension reading LinkedIn with their account. */
export const sourcingRiskAcceptance = pgTable(
  'sourcing_risk_acceptance',
  {
    organizationId: organizationRef(),
    userId: text('user_id').notNull(),
    textVersion: integer('text_version').notNull(),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.organizationId, table.userId] })],
);

export type SourcedContactRow = typeof sourcedContact.$inferSelect;
