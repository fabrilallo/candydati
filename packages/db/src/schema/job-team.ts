import type { JobTeamRole } from '@tt/domain';
import { index, pgTable, primaryKey, text, timestamp } from 'drizzle-orm/pg-core';
import { organization } from './auth.js';
import { job } from './job.js';

/**
 * The selection team of a job (PRODUCT.md §6, access by ad). People who are not organization-wide (hiring managers,
 * interviewers, and recruiters when the organization restricts them) see a job's candidates only when they are on its
 * team, explicitly here or implicitly as an interviewer of one of its stages (`job_stage_interviewer`). `user_id` is plain
 * text with no foreign key, like tasks and notes.
 */
export const jobTeamMember = pgTable(
  'job_team_member',
  {
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'restrict' }),
    jobId: text('job_id')
      .notNull()
      .references(() => job.id, { onDelete: 'restrict' }),
    userId: text('user_id').notNull(),
    role: text('role').$type<JobTeamRole>().notNull(),
    /** User id, or `system` for automatic additions (job creator, backfill). */
    addedBy: text('added_by').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ name: 'job_team_member_pk', columns: [table.organizationId, table.jobId, table.userId] }),
    // Backs the scope lookup: the jobs of one person.
    index('job_team_member_org_user_idx').on(table.organizationId, table.userId),
  ],
);

export type JobTeamMemberRow = typeof jobTeamMember.$inferSelect;
