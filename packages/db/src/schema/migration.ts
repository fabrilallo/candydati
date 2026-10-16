import type {
  ConnectorMaturity,
  MigrationCounts,
  MigrationDeclarations,
  MigrationIssueLevel,
  MigrationStageMapping,
  MigrationStatus,
} from '@candydati/domain';
import { sql } from 'drizzle-orm';
import { check, index, integer, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { organization } from './auth.js';

const organizationRef = () =>
  text('organization_id')
    .notNull()
    .references(() => organization.id, { onDelete: 'restrict' });

/**
 * One migration from another ATS (ADR 0009): a package (uploaded, or built by a connector) previewed and then committed
 * as a whole. Every migrated row points back here (`migration_batch_id`, RESTRICT), so the undo finds it; the batch row
 * itself stays after the undo with its counts.
 */
export const migrationBatch = pgTable(
  'migration_batch',
  {
    id: text('id').primaryKey(),
    organizationId: organizationRef(),
    status: text('status').$type<MigrationStatus>().notNull(),
    /** As the package says (`teamtailor`, `workable`, ...): free text, never trusted for logic. */
    sourceSystem: text('source_system').notNull(),
    producer: text('producer').notNull(),
    connectorMaturity: text('connector_maturity').$type<ConnectorMaturity>().notNull(),
    /** Plain text with no foreign key: the batch survives the removal of the user who started it. */
    createdBy: text('created_by').notNull(),
    counts: jsonb('counts').$type<MigrationCounts>().notNull().default(sql`'{}'::jsonb`),
    /** Package job and stage → Candydati stage type and title, as proposed by the analysis and edited in the preview. */
    stageMapping: jsonb('stage_mapping').$type<MigrationStageMapping>().notNull().default(sql`'[]'::jsonb`),
    /** Package job refs the operator left out. */
    excludedJobs: text('excluded_jobs').array().notNull().default(sql`'{}'::text[]`),
    /** The operator's three statements, set once when the commit is requested. */
    declarations: jsonb('declarations').$type<MigrationDeclarations>(),
    /** Storage key of the package ZIP; the file is purged a few days after the batch ends. */
    packageKey: text('package_key').notNull(),
    /** A connector's API key, encrypted, only while the fetch runs: wiped right after, never logged. */
    credentialsCiphertext: text('credentials_ciphertext'),
    /** A short code, never a provider's or a parser's text. */
    error: text('error'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    committedAt: timestamp('committed_at', { withTimezone: true }),
    undoneAt: timestamp('undone_at', { withTimezone: true }),
    /** When the package file and the issues were deleted (some days after the batch ended): the purge is then done. */
    purgedAt: timestamp('purged_at', { withTimezone: true }),
    /**
     * A connector fetch larger than one package is split into parts, one batch each: `group_id` is the id of part 1,
     * `part` the 1-based number. Both null for an uploaded package. No foreign key: part 1 is a batch like the others.
     */
    groupId: text('group_id'),
    part: integer('part'),
  },
  (table) => [
    index('migration_batch_org_created_idx').on(table.organizationId, sql`${table.createdAt} desc`),
    check(
      'migration_batch_status_check',
      sql`${table.status} in ('uploaded', 'fetching', 'analyzing', 'ready', 'importing', 'done', 'failed', 'undone')`,
    ),
    check('migration_batch_maturity_check', sql`${table.connectorMaturity} in ('beta', 'stable', 'package')`),
    check('migration_batch_part_check', sql`(${table.groupId} is null) = (${table.part} is null) and (${table.part} is null or ${table.part} >= 1)`),
  ],
);

/** A finding of the analysis, shown in the preview. `ref` is the package ref it is about (job, candidate, file path). */
export const migrationIssue = pgTable(
  'migration_issue',
  {
    id: text('id').primaryKey(),
    organizationId: organizationRef(),
    batchId: text('batch_id')
      .notNull()
      .references(() => migrationBatch.id, { onDelete: 'restrict' }),
    level: text('level').$type<MigrationIssueLevel>().notNull(),
    code: text('code').notNull(),
    ref: text('ref'),
    detail: text('detail'),
  },
  (table) => [
    index('migration_issue_org_batch_level_idx').on(table.organizationId, table.batchId, table.level),
    check('migration_issue_level_check', sql`${table.level} in ('error', 'warning', 'info')`),
  ],
);

/** Nullable link of a migrated row to its batch: RESTRICT, so a batch cannot vanish under its rows. */
export const migrationBatchRef = () => text('migration_batch_id').references(() => migrationBatch.id, { onDelete: 'restrict' });

export type MigrationBatchRow = typeof migrationBatch.$inferSelect;
export type MigrationIssueRow = typeof migrationIssue.$inferSelect;
