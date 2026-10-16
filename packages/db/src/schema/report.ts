import type { ActorType, Outcome, PromiseStatus } from '@candydati/domain';
import { sql } from 'drizzle-orm';
import { boolean, index, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { organization } from './auth.js';
import { application } from './candidate.js';
import { job } from './job.js';
import { migrationBatchRef } from './migration.js';

const organizationRef = () =>
  text('organization_id')
    .notNull()
    .references(() => organization.id, { onDelete: 'restrict' });

/**
 * Every entry of an application into a stage (intake: `from` null) and every decision (`to` null, `outcome` set).
 * Written by core from now on; older rows are rebuilt by the migration (`backfilled`). Removed with the application on erasure.
 */
export const applicationStageEvent = pgTable(
  'application_stage_event',
  {
    id: text('id').primaryKey(),
    organizationId: organizationRef(),
    applicationId: text('application_id')
      .notNull()
      .references(() => application.id, { onDelete: 'restrict' }),
    jobId: text('job_id')
      .notNull()
      .references(() => job.id, { onDelete: 'restrict' }),
    fromStageId: text('from_stage_id'),
    toStageId: text('to_stage_id'),
    outcome: text('outcome').$type<Outcome>(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
    actorType: text('actor_type').$type<ActorType>().notNull(),
    backfilled: boolean('backfilled').notNull().default(false),
    migrationBatchId: migrationBatchRef(),
  },
  (table) => [
    index('application_stage_event_org_occurred_idx').on(table.organizationId, table.occurredAt),
    index('application_stage_event_application_idx').on(table.applicationId),
    index('application_stage_event_migration_batch_idx').on(table.migrationBatchId).where(sql`${table.migrationBatchId} is not null`),
  ],
);

/** "We answer within N days" for one stage of one application: see `ResponsePromise` in @candydati/domain. */
export const responsePromise = pgTable(
  'response_promise',
  {
    id: text('id').primaryKey(),
    organizationId: organizationRef(),
    applicationId: text('application_id')
      .notNull()
      .references(() => application.id, { onDelete: 'restrict' }),
    jobId: text('job_id')
      .notNull()
      .references(() => job.id, { onDelete: 'restrict' }),
    stageId: text('stage_id').notNull(),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
    dueAt: timestamp('due_at', { withTimezone: true }).notNull(),
    respondedAt: timestamp('responded_at', { withTimezone: true }),
    status: text('status').$type<PromiseStatus>().notNull(),
    backfilled: boolean('backfilled').notNull().default(false),
  },
  (table) => [
    index('response_promise_application_idx').on(table.applicationId),
    index('response_promise_org_due_idx').on(table.organizationId, table.dueAt),
    // Backs the hourly flip of overdue promises.
    index('response_promise_open_due_idx').on(table.dueAt).where(sql`${table.status} = 'open'`),
  ],
);

export type ApplicationStageEventRow = typeof applicationStageEvent.$inferSelect;
export type ResponsePromiseRow = typeof responsePromise.$inferSelect;
