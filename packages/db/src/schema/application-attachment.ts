import type { AttachmentKind, AttachmentMediaType } from '@candydati/domain';
import { sql } from 'drizzle-orm';
import { check, index, integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { organization } from './auth.js';
import { application } from './candidate.js';
import { migrationBatchRef } from './migration.js';

/**
 * Files of an application other than its CV (today brought only by a migration, ADR 0009). The application is RESTRICT:
 * the erasure deletes these rows (and returns their keys) before the application, so a forgotten path fails loudly
 * instead of leaving a file behind. The key always sits under the application's storage prefix.
 */
export const applicationAttachment = pgTable(
  'application_attachment',
  {
    id: text('id').primaryKey(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'restrict' }),
    applicationId: text('application_id')
      .notNull()
      .references(() => application.id, { onDelete: 'restrict' }),
    migrationBatchId: migrationBatchRef(),
    kind: text('kind').$type<AttachmentKind>().notNull(),
    fileName: text('file_name').notNull(),
    mediaType: text('media_type').$type<AttachmentMediaType>().notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    storageKey: text('storage_key').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('application_attachment_org_application_idx').on(table.organizationId, table.applicationId),
    index('application_attachment_migration_batch_idx').on(table.migrationBatchId).where(sql`${table.migrationBatchId} is not null`),
    check('application_attachment_kind_check', sql`${table.kind} in ('cover_letter', 'other')`),
    check(
      'application_attachment_media_type_check',
      sql`${table.mediaType} in ('application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/msword', 'application/vnd.oasis.opendocument.text', 'application/rtf', 'text/plain', 'image/png', 'image/jpeg')`,
    ),
    // ATTACHMENT_MAX_BYTES of @candydati/domain (the CV limit); a test keeps the two equal.
    check('application_attachment_size_check', sql`${table.sizeBytes} >= 0 and ${table.sizeBytes} <= 10485760`),
    check(
      'application_attachment_key_check',
      sql`${table.storageKey} = 'organizations/' || ${table.organizationId} || '/applications/' || ${table.applicationId} || '/attachments/' || ${table.id}`,
    ),
  ],
);

export type ApplicationAttachmentRow = typeof applicationAttachment.$inferSelect;
