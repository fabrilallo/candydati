import type { DomainRecord, DomainStatus, EmailTemplateKind, MessageDirection, MessageStatus } from '@candydati/domain';
import { sql } from 'drizzle-orm';
import { boolean, check, index, jsonb, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { organization } from './auth.js';
import { application, candidate } from './candidate.js';
import { migrationBatchRef } from './migration.js';

const organizationRef = () =>
  text('organization_id')
    .notNull()
    .references(() => organization.id, { onDelete: 'restrict' });

/** Sender identity of an organization: one row, created the first time it is set. */
export const emailSettings = pgTable('email_settings', {
  organizationId: text('organization_id')
    .primaryKey()
    .references(() => organization.id, { onDelete: 'restrict' }),
  senderName: text('sender_name').notNull(),
  fromAddress: text('from_address'),
  domain: text('domain'),
  domainStatus: text('domain_status').$type<DomainStatus>(),
  domainRecords: jsonb('domain_records').$type<readonly DomainRecord[]>().notNull().default(sql`'[]'::jsonb`),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

/** An edited default (one per kind) or a custom template (as many as needed). */
export const emailTemplate = pgTable(
  'email_template',
  {
    id: text('id').primaryKey(),
    organizationId: organizationRef(),
    kind: text('kind').$type<EmailTemplateKind>().notNull(),
    name: text('name').notNull(),
    subject: text('subject').notNull(),
    body: text('body').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('email_template_org_kind_uidx')
      .on(table.organizationId, table.kind)
      .where(sql`${table.kind} <> 'custom'`),
  ],
);

/** One per application. The token in the reply address is how an inbound email finds it. */
export const conversation = pgTable(
  'conversation',
  {
    applicationId: text('application_id')
      .primaryKey()
      .references(() => application.id, { onDelete: 'restrict' }),
    organizationId: organizationRef(),
    token: text('token').notNull(),
  },
  (table) => [uniqueIndex('conversation_token_uidx').on(table.token)],
);

export const message = pgTable(
  'message',
  {
    id: text('id').primaryKey(),
    organizationId: organizationRef(),
    applicationId: text('application_id')
      .notNull()
      .references(() => application.id, { onDelete: 'restrict' }),
    candidateId: text('candidate_id')
      .notNull()
      .references(() => candidate.id, { onDelete: 'restrict' }),
    direction: text('direction').$type<MessageDirection>().notNull(),
    subject: text('subject').notNull(),
    bodyText: text('body_text').notNull(),
    status: text('status').$type<MessageStatus>().notNull(),
    providerMessageId: text('provider_message_id'),
    /** Plain text with no foreign key (user id, `system`, or null for inbound): survives removed users. */
    sentBy: text('sent_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    error: text('error'),
    rawText: text('raw_text'),
    unverifiedSender: boolean('unverified_sender').notNull().default(false),
    inboundMessageId: text('inbound_message_id'),
    /** An email of the past, brought by a migration: shown in the conversation, never sent, never counted by the caps. */
    historical: boolean('historical').notNull().default(false),
    migrationBatchId: migrationBatchRef(),
  },
  (table) => [
    index('message_org_application_created_idx').on(table.organizationId, table.applicationId, table.createdAt),
    // Hourly caps count the outbound messages sent to one candidate (historical ones are not ours to count).
    index('message_org_candidate_outbound_idx')
      .on(table.organizationId, table.candidateId, table.createdAt)
      .where(sql`${table.direction} = 'outbound' and ${table.historical} = false`),
    index('message_migration_batch_idx').on(table.migrationBatchId).where(sql`${table.migrationBatchId} is not null`),
    check('message_historical_check', sql`not ${table.historical} or ${table.status} in ('sent', 'received')`),
    // Postgres treats nulls as distinct: outbound messages (null) never collide, a repeated inbound id does.
    uniqueIndex('message_org_inbound_message_id_uidx').on(table.organizationId, table.inboundMessageId),
  ],
);

export type EmailSettingsRow = typeof emailSettings.$inferSelect;
export type EmailTemplateRow = typeof emailTemplate.$inferSelect;
export type ConversationRow = typeof conversation.$inferSelect;
export type MessageRow = typeof message.$inferSelect;
