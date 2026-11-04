import type { CriterionObservation, FeedbackRecommendation, InterviewerKind } from '@candydati/domain';
import { sql } from 'drizzle-orm';
import { index, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { organization } from './auth.js';
import { application } from './candidate.js';
import { job } from './job.js';

const organizationRef = () =>
  text('organization_id')
    .notNull()
    .references(() => organization.id, { onDelete: 'restrict' });

/** Who is asked for feedback when an application enters a stage of a job. Members by user id, externals by email. */
export const jobStageInterviewer = pgTable(
  'job_stage_interviewer',
  {
    id: text('id').primaryKey(),
    organizationId: organizationRef(),
    jobId: text('job_id')
      .notNull()
      .references(() => job.id, { onDelete: 'restrict' }),
    stageId: text('stage_id').notNull(),
    kind: text('kind').$type<InterviewerKind>().notNull(),
    /** Plain text with no foreign key: the configuration survives a removed member. */
    userId: text('user_id'),
    email: text('email'),
    name: text('name').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('job_stage_interviewer_org_job_idx').on(table.organizationId, table.jobId)],
);

/**
 * A request for feedback, one per interviewer. Only the hash of the secret in the link is stored. The row goes with
 * its application (RESTRICT: the erasure must delete it explicitly).
 */
export const feedbackRequest = pgTable(
  'feedback_request',
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
    interviewerKind: text('interviewer_kind').$type<InterviewerKind>().notNull(),
    interviewerUserId: text('interviewer_user_id'),
    interviewerEmail: text('interviewer_email').notNull(),
    interviewerName: text('interviewer_name').notNull(),
    tokenHash: text('token_hash').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    remindersSent: integer('reminders_sent').notNull().default(0),
    lastReminderAt: timestamp('last_reminder_at', { withTimezone: true }),
    requestedBy: text('requested_by').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    submittedAt: timestamp('submitted_at', { withTimezone: true }),
  },
  (table) => [
    uniqueIndex('feedback_request_token_hash_uidx').on(table.tokenHash),
    index('feedback_request_org_application_idx').on(table.organizationId, table.applicationId),
  ],
);

/** What an interviewer left. There is no score column on purpose (PRODUCT.md §2, principle 4). One per request. */
export const interviewFeedback = pgTable(
  'interview_feedback',
  {
    id: text('id').primaryKey(),
    organizationId: organizationRef(),
    applicationId: text('application_id')
      .notNull()
      .references(() => application.id, { onDelete: 'restrict' }),
    requestId: text('request_id')
      .notNull()
      .references(() => feedbackRequest.id, { onDelete: 'restrict' }),
    stageId: text('stage_id').notNull(),
    interviewerName: text('interviewer_name').notNull(),
    answers: jsonb('answers').$type<Record<string, string>>().notNull(),
    recommendation: text('recommendation').$type<FeedbackRecommendation>().notNull(),
    /** One per scorecard criterion asked at the stage, label included as written against: words and evidence, never a number. */
    observations: jsonb('observations').$type<readonly CriterionObservation[]>().notNull().default(sql`'[]'::jsonb`),
    submittedAt: timestamp('submitted_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex('interview_feedback_request_uidx').on(table.requestId),
    index('interview_feedback_org_application_idx').on(table.organizationId, table.applicationId),
  ],
);

/**
 * The scorecard of a job: what the interviewers look for, declared before the interviews (PRODUCT.md §3.1). There is no
 * weight or score column on purpose (§2.4). A criterion is editable until `first_used_at`; after that it is only retired,
 * so past feedback stays consistent (it also keeps the label it was written against).
 */
export const jobScorecardCriterion = pgTable(
  'job_scorecard_criterion',
  {
    id: text('id').primaryKey(),
    organizationId: organizationRef(),
    jobId: text('job_id')
      .notNull()
      .references(() => job.id, { onDelete: 'restrict' }),
    /** Null: asked at every declared stage. */
    stageId: text('stage_id'),
    label: text('label').notNull(),
    position: integer('position').notNull(),
    createdBy: text('created_by').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    firstUsedAt: timestamp('first_used_at', { withTimezone: true }),
    retiredAt: timestamp('retired_at', { withTimezone: true }),
  },
  (table) => [index('job_scorecard_criterion_org_job_idx').on(table.organizationId, table.jobId)],
);

export type JobScorecardCriterionRow = typeof jobScorecardCriterion.$inferSelect;
export type JobStageInterviewerRow = typeof jobStageInterviewer.$inferSelect;
export type FeedbackRequestRow = typeof feedbackRequest.$inferSelect;
export type InterviewFeedbackRow = typeof interviewFeedback.$inferSelect;
