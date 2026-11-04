import type { ClientAnswer, ClientContact, ClientDisplay } from '@candydati/domain';
import { sql } from 'drizzle-orm';
import { boolean, check, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { organization } from './auth.js';
import { application } from './candidate.js';
import { job } from './job.js';

const organizationRef = () =>
  text('organization_id')
    .notNull()
    .references(() => organization.id, { onDelete: 'restrict' });

/**
 * A client of an agency (PRODUCT.md §3.5). `contacts` (the client's hiring contacts, name and email) is validated with
 * Zod when read: jsonb is a boundary. Archived, never deleted while jobs point at it.
 */
export const client = pgTable(
  'client',
  {
    id: text('id').primaryKey(),
    organizationId: organizationRef(),
    name: text('name').notNull(),
    website: text('website'),
    logoUrl: text('logo_url'),
    contacts: jsonb('contacts').$type<ClientContact[]>().notNull().default([]),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    createdBy: text('created_by').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex('client_org_name_uidx').on(table.organizationId, sql`lower(${table.name})`)],
);

/** The client of a job, at most one. Apart from `job` so that saving a job never touches it. */
export const jobClient = pgTable(
  'job_client',
  {
    jobId: text('job_id')
      .primaryKey()
      .references(() => job.id, { onDelete: 'restrict' }),
    organizationId: organizationRef(),
    clientId: text('client_id')
      .notNull()
      .references(() => client.id, { onDelete: 'restrict' }),
    display: text('display').$type<ClientDisplay>().notNull().default('named'),
    updatedBy: text('updated_by').notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('job_client_org_client_idx').on(table.organizationId, table.clientId), check('job_client_display_check', sql`${table.display} in ('named', 'confidential')`)],
);

/** A shortlist sent to one contact of a client. Only the hash of the secret in the link is stored. */
export const clientShortlist = pgTable(
  'client_shortlist',
  {
    id: text('id').primaryKey(),
    organizationId: organizationRef(),
    jobId: text('job_id')
      .notNull()
      .references(() => job.id, { onDelete: 'restrict' }),
    clientId: text('client_id')
      .notNull()
      .references(() => client.id, { onDelete: 'restrict' }),
    /** Plain text, no foreign key: the contact lives in `client.contacts`, and its name and email are copied here. */
    recipientContactId: text('recipient_contact_id').notNull(),
    recipientName: text('recipient_name').notNull(),
    recipientEmail: text('recipient_email').notNull(),
    tokenHash: text('token_hash').notNull(),
    message: text('message'),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    remindersSent: integer('reminders_sent').notNull().default(0),
    lastReminderAt: timestamp('last_reminder_at', { withTimezone: true }),
    firstOpenedAt: timestamp('first_opened_at', { withTimezone: true }),
    createdBy: text('created_by').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex('client_shortlist_token_hash_uidx').on(table.tokenHash), index('client_shortlist_org_job_idx').on(table.organizationId, table.jobId)],
);

/**
 * One candidate of a shortlist and the client's answer. Goes with its application (RESTRICT: erasure deletes it
 * explicitly). There is no score column on purpose (principle 4): the answer is "meet" or "not for us" with a reason.
 */
export const clientShortlistItem = pgTable(
  'client_shortlist_item',
  {
    id: text('id').primaryKey(),
    organizationId: organizationRef(),
    shortlistId: text('shortlist_id')
      .notNull()
      .references(() => clientShortlist.id, { onDelete: 'restrict' }),
    applicationId: text('application_id')
      .notNull()
      .references(() => application.id, { onDelete: 'restrict' }),
    position: integer('position').notNull(),
    shareCv: boolean('share_cv').notNull().default(false),
    sharedNoteIds: jsonb('shared_note_ids').$type<string[]>().notNull().default([]),
    answer: text('answer').$type<ClientAnswer>(),
    answerReason: text('answer_reason'),
    answeredAt: timestamp('answered_at', { withTimezone: true }),
    candidateNotifiedAt: timestamp('candidate_notified_at', { withTimezone: true }),
  },
  (table) => [
    uniqueIndex('client_shortlist_item_shortlist_application_uidx').on(table.shortlistId, table.applicationId),
    index('client_shortlist_item_org_application_idx').on(table.organizationId, table.applicationId),
    check('client_shortlist_item_answer_check', sql`${table.answer} is null or ${table.answer} in ('meet', 'not_for_us')`),
  ],
);

export type ClientRow = typeof client.$inferSelect;
export type JobClientRow = typeof jobClient.$inferSelect;
export type ClientShortlistRow = typeof clientShortlist.$inferSelect;
export type ClientShortlistItemRow = typeof clientShortlistItem.$inferSelect;
