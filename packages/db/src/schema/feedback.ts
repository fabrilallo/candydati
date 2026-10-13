import type { FeedbackRecommendation, InterviewerKind } from '@tt/domain';
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

/** What an interviewer left. There is no score column on purpose (PLAN §1, principle 4). One per request. */
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
    submittedAt: timestamp('submitted_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex('interview_feedback_request_uidx').on(table.requestId),
    index('interview_feedback_org_application_idx').on(table.organizationId, table.applicationId),
  ],
);

export type JobStageInterviewerRow = typeof jobStageInterviewer.$inferSelect;
export type FeedbackRequestRow = typeof feedbackRequest.$inferSelect;
export type InterviewFeedbackRow = typeof interviewFeedback.$inferSelect;
