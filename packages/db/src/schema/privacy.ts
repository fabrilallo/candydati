import type { DataExportStatus } from '@tt/domain';
import { sql } from 'drizzle-orm';
import { bigint, index, integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { organization } from './auth.js';

const organizationRef = () =>
  text('organization_id')
    .notNull()
    .references(() => organization.id, { onDelete: 'restrict' });

/** One daily run of the retention job for one organization: counts only, no candidate data. */
export const retentionRun = pgTable(
  'retention_run',
  {
    id: text('id').primaryKey(),
    organizationId: organizationRef(),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
    warned: integer('warned').notNull().default(0),
    erased: integer('erased').notNull().default(0),
  },
  (table) => [index('retention_run_org_started_idx').on(table.organizationId, sql`${table.startedAt} desc`)],
);

/**
 * Request of a full organization export. The ZIP is in file storage under `organizations/{org}/exports/{id}.zip` and is
 * deleted, with this row's file, once `expires_at` has passed.
 */
export const dataExport = pgTable(
  'data_export',
  {
    id: text('id').primaryKey(),
    organizationId: organizationRef(),
    /** Plain text with no foreign key: the export record survives the removal of the user who asked. */
    requestedBy: text('requested_by').notNull(),
    status: text('status').$type<DataExportStatus>().notNull().default('pending'),
    sizeBytes: bigint('size_bytes', { mode: 'number' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (table) => [index('data_export_org_created_idx').on(table.organizationId, sql`${table.createdAt} desc`)],
);

export type RetentionRunRow = typeof retentionRun.$inferSelect;
export type DataExportRow = typeof dataExport.$inferSelect;
