import type { JobRequestInput, JobRequestStatus } from '@candydati/domain';
import { boolean, index, integer, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { organization } from './auth.js';
import { job } from './job.js';

const organizationRef = () =>
  text('organization_id')
    .notNull()
    .references(() => organization.id, { onDelete: 'restrict' });

/** A hiring manager's request for a position. People are plain text with no foreign key, like tasks and notes. */
export const jobRequest = pgTable(
  'job_request',
  {
    id: text('id').primaryKey(),
    organizationId: organizationRef(),
    requestedBy: text('requested_by').notNull(),
    title: text('title').notNull(),
    role: text('role').$type<JobRequestInput['role']>(),
    seniority: text('seniority').$type<JobRequestInput['seniority']>(),
    reason: text('reason').notNull(),
    headcount: integer('headcount').notNull().default(1),
    salaryMin: integer('salary_min').notNull(),
    salaryMax: integer('salary_max').notNull(),
    currency: text('currency').$type<JobRequestInput['currency']>().notNull(),
    workMode: text('work_mode').$type<JobRequestInput['workMode']>(),
    location: jsonb('location').$type<JobRequestInput['location']>().notNull(),
    desiredStart: text('desired_start'),
    processNotes: text('process_notes').notNull().default(''),
    interviewersNotes: text('interviewers_notes').notNull().default(''),
    language: text('language').$type<JobRequestInput['language']>().notNull(),
    status: text('status').$type<JobRequestStatus>().notNull().default('submitted'),
    decidedBy: text('decided_by'),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    decisionNote: text('decision_note'),
    jobId: text('job_id').references(() => job.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('job_request_org_status_idx').on(table.organizationId, table.status, table.createdAt)],
);

/** Settings of an organization that are not email or privacy. One row per organization, absent means the defaults. */
export const organizationSetting = pgTable('organization_setting', {
  organizationId: text('organization_id')
    .primaryKey()
    .references(() => organization.id, { onDelete: 'restrict' }),
  /** Publishing needs an approved budget (PRODUCT.md §3.1). Off by default. */
  requireApproval: boolean('require_approval').notNull().default(false),
  /** Recruiters see only the jobs whose team they are on (PRODUCT.md §6). Off by default: they see every job. */
  restrictRecruitersToTeam: boolean('restrict_recruiters_to_team').notNull().default(false),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export type JobRequestRow = typeof jobRequest.$inferSelect;
export type OrganizationSettingRow = typeof organizationSetting.$inferSelect;
