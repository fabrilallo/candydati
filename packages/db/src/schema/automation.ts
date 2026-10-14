import type { AutomationActionType, DeliveredEventType, NotificationKind, WebhookEventType } from '@tt/domain';
import { sql } from 'drizzle-orm';
import { boolean, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { organization } from './auth.js';
import { application } from './candidate.js';
import { job } from './job.js';

const organizationRef = () =>
  text('organization_id')
    .notNull()
    .references(() => organization.id, { onDelete: 'restrict' });

/** Follow-up tasks. People are plain text with no foreign key: tasks survive removed users, like notes. */
export const task = pgTable(
  'task',
  {
    id: text('id').primaryKey(),
    organizationId: organizationRef(),
    applicationId: text('application_id').references(() => application.id, { onDelete: 'restrict' }),
    jobId: text('job_id').references(() => job.id, { onDelete: 'restrict' }),
    title: text('title').notNull(),
    assigneeId: text('assignee_id').notNull(),
    dueAt: timestamp('due_at', { withTimezone: true }),
    createdBy: text('created_by').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
  },
  (table) => [
    index('task_org_assignee_idx').on(table.organizationId, table.assigneeId, table.completedAt),
    index('task_org_application_idx').on(table.organizationId, table.applicationId),
    index('task_open_due_idx').on(table.dueAt).where(sql`${table.completedAt} is null and ${table.dueAt} is not null`),
  ],
);

/**
 * In-app notification. `dedupe_key` is unique per (organization, user): the hourly scan inserts with ON CONFLICT DO
 * NOTHING and so never notifies twice for the same (kind, application, stage). `payload` holds ids and counts only.
 */
export const notification = pgTable(
  'notification',
  {
    id: text('id').primaryKey(),
    organizationId: organizationRef(),
    userId: text('user_id').notNull(),
    kind: text('kind').$type<NotificationKind>().notNull(),
    applicationId: text('application_id').references(() => application.id, { onDelete: 'restrict' }),
    jobId: text('job_id').references(() => job.id, { onDelete: 'restrict' }),
    taskId: text('task_id').references(() => task.id, { onDelete: 'restrict' }),
    dedupeKey: text('dedupe_key').notNull(),
    payload: jsonb('payload').$type<Record<string, string | number | boolean | null>>().notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    readAt: timestamp('read_at', { withTimezone: true }),
    /** When the notification went out in an email digest. Null: still to send (a crash before the send loses nothing). */
    emailedAt: timestamp('emailed_at', { withTimezone: true }),
  },
  (table) => [
    uniqueIndex('notification_org_user_dedupe_uidx').on(table.organizationId, table.userId, table.dedupeKey),
    index('notification_org_user_created_idx').on(table.organizationId, table.userId, sql`${table.createdAt} desc`),
    // Backs the email digest scan: only what is still to send.
    index('notification_unemailed_idx').on(table.createdAt).where(sql`${table.emailedAt} is null`),
    // Backs the unread badge and mark-all-read.
    index('notification_unread_idx').on(table.organizationId, table.userId).where(sql`${table.readAt} is null`),
  ],
);

/** A rule of a job: when an application enters `stage_id`, do `action`. Only `send_template` and `create_task` exist. */
export const automationRule = pgTable(
  'automation_rule',
  {
    id: text('id').primaryKey(),
    organizationId: organizationRef(),
    jobId: text('job_id')
      .notNull()
      .references(() => job.id, { onDelete: 'restrict' }),
    stageId: text('stage_id').notNull(),
    action: text('action').$type<AutomationActionType>().notNull(),
    /** The action's own fields without `type` (validated with `automationActionSchema` when read). */
    config: jsonb('config').$type<Record<string, unknown>>().notNull(),
    enabled: boolean('enabled').notNull().default(true),
    createdBy: text('created_by').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('automation_rule_org_job_stage_idx').on(table.organizationId, table.jobId, table.stageId)],
);

/**
 * One run of a rule for one entry of an application into the rule's stage: inserted (ON CONFLICT DO NOTHING) in the
 * same transaction as what the rule does, so a redelivered `automation.run` finds it and does nothing twice. Goes with
 * the application or the rule.
 */
export const automationExecution = pgTable(
  'automation_execution',
  {
    id: text('id').primaryKey(),
    organizationId: organizationRef(),
    ruleId: text('rule_id')
      .notNull()
      .references(() => automationRule.id, { onDelete: 'cascade' }),
    applicationId: text('application_id')
      .notNull()
      .references(() => application.id, { onDelete: 'cascade' }),
    stageId: text('stage_id').notNull(),
    /** `stage_changed_at` of the application when it entered the stage: each entry runs the rule once. */
    stageEnteredAt: timestamp('stage_entered_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex('automation_execution_entry_uq').on(table.ruleId, table.applicationId, table.stageId, table.stageEnteredAt)],
);

/**
 * Webhook endpoint of an organization. The signing secret is stored as is: the platform has to HMAC every payload with
 * it, so it cannot be hashed. It is generated by the server, returned ONCE when the endpoint is created and never
 * again by any read; encryption at rest is a separate decision.
 */
export const webhookEndpoint = pgTable(
  'webhook_endpoint',
  {
    id: text('id').primaryKey(),
    organizationId: organizationRef(),
    url: text('url').notNull(),
    secret: text('secret').notNull(),
    events: text('events').array().$type<WebhookEventType[]>().notNull(),
    enabled: boolean('enabled').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('webhook_endpoint_org_idx').on(table.organizationId)],
);

/** Events to publish, written in the same transaction as the change that caused them; a worker fans them out. */
export const outboxEvent = pgTable(
  'outbox_event',
  {
    id: text('id').primaryKey(),
    organizationId: organizationRef(),
    type: text('type').$type<DeliveredEventType>().notNull(),
    /** Ids and non-personal fields only. */
    data: jsonb('data').$type<Record<string, string | number | boolean | null>>().notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    /** Failed fan-outs so far; the event is parked (`dead_at`) after the last allowed one. */
    attempts: integer('attempts').notNull().default(0),
    /** A short code of the last failure, never personal data. */
    lastError: text('last_error'),
    /** Backoff: the publisher skips the event until then. Null: due now. */
    nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true }),
    /** Dead letter: set when the event ran out of attempts; the publisher never takes it again. */
    deadAt: timestamp('dead_at', { withTimezone: true }),
  },
  (table) => [
    index('outbox_event_unpublished_idx').on(table.occurredAt).where(sql`${table.publishedAt} is null`),
    index('outbox_event_org_idx').on(table.organizationId),
    // Erasure looks events up by the ids they mention.
    index('outbox_event_org_candidate_idx').on(table.organizationId, sql`(${table.data} ->> 'candidateId')`),
    index('outbox_event_org_application_idx').on(table.organizationId, sql`(${table.data} ->> 'applicationId')`),
  ],
);

/** One row per delivery attempt. */
export const webhookDelivery = pgTable(
  'webhook_delivery',
  {
    id: text('id').primaryKey(),
    organizationId: organizationRef(),
    endpointId: text('endpoint_id')
      .notNull()
      .references(() => webhookEndpoint.id, { onDelete: 'cascade' }),
    eventId: text('event_id').notNull(),
    eventType: text('event_type').$type<DeliveredEventType>().notNull(),
    status: text('status').$type<'success' | 'failed'>().notNull(),
    responseCode: integer('response_code'),
    attempt: integer('attempt').notNull(),
    /** A short code (`timeout`, `host_blocked`, `http_error`, `network_error`), never the response body. */
    error: text('error'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('webhook_delivery_endpoint_created_idx').on(table.organizationId, table.endpointId, sql`${table.createdAt} desc`),
    // One successful delivery per (endpoint, event): backs `hasSucceeded` and makes a double success impossible.
    uniqueIndex('webhook_delivery_success_uidx')
      .on(table.endpointId, table.eventId)
      .where(sql`${table.status} = 'success'`),
  ],
);

export type TaskRow = typeof task.$inferSelect;
export type NotificationRow = typeof notification.$inferSelect;
export type AutomationRuleRow = typeof automationRule.$inferSelect;
export type AutomationExecutionRow = typeof automationExecution.$inferSelect;
export type WebhookEndpointRow = typeof webhookEndpoint.$inferSelect;
export type OutboxEventRow = typeof outboxEvent.$inferSelect;
export type WebhookDeliveryRow = typeof webhookDelivery.$inferSelect;
