import type { SourcedContactStatus, SourcingEvidence, SourcingSource } from '@candydati/domain';
import { sql } from 'drizzle-orm';
import { index, jsonb, pgTable, primaryKey, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { organization } from './auth.js';
import { job } from './job.js';

const organizationRef = () =>
  text('organization_id')
    .notNull()
    .references(() => organization.id, { onDelete: 'restrict' });

/**
 * A person found outside Candydati for a job (LinkedIn, GitHub, the web). Not a candidate: they did not apply. Erased
 * by the retention job at `expires_at` (30 days after collection) or at once when they object through the notice link.
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
    source: text('source').$type<SourcingSource>().notNull(),
    profileUrl: text('profile_url').notNull(),
    profileKey: text('profile_key').notNull(),
    email: text('email'),
    evidence: jsonb('evidence').$type<SourcingEvidence[]>().notNull().default(sql`'[]'::jsonb`),
    status: text('status').$type<SourcedContactStatus>().notNull().default('found'),
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

/**
 * People who asked not to be contacted (art. 21): only a keyed hash of their profile key or email, never the value, so
 * the organization can honour the objection without keeping who it was. Never expires.
 */
export const sourcingObjection = pgTable(
  'sourcing_objection',
  {
    organizationId: organizationRef(),
    fingerprint: text('fingerprint').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [primaryKey({ columns: [table.organizationId, table.fingerprint] })],
);

export type SourcedContactRow = typeof sourcedContact.$inferSelect;
