import type { InterviewerKind, InterviewMode, InterviewStatus, WorkingHours } from '@candydati/domain';
import { sql } from 'drizzle-orm';
import { index, integer, jsonb, pgTable, primaryKey, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { organization, user } from './auth.js';
import { application } from './candidate.js';
import { job } from './job.js';

const organizationRef = () =>
  text('organization_id')
    .notNull()
    .references(() => organization.id, { onDelete: 'restrict' });

/** A busy interval as stored: ISO instants, nothing about what the event was. */
export interface StoredBusy {
  readonly start: string;
  readonly end: string;
}

/**
 * A member's secret iCal address, one per person and organization. The address is sealed at rest and never read back
 * to anyone; only busy times inside the booking horizon are kept (no titles, attendees or descriptions). Goes with the
 * user (cascade) and is deleted when they leave the organization.
 */
export const calendarFeed = pgTable(
  'calendar_feed',
  {
    organizationId: organizationRef(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    urlCiphertext: text('url_ciphertext').notNull(),
    /** "calendar.google.com": enough for the person to recognize which calendar it is. */
    host: text('host').notNull(),
    timeZone: text('time_zone').notNull(),
    workingHours: jsonb('working_hours').$type<WorkingHours>().notNull(),
    busy: jsonb('busy').$type<readonly StoredBusy[]>().notNull().default(sql`'[]'::jsonb`),
    fetchedAt: timestamp('fetched_at', { withTimezone: true }),
    lastError: text('last_error'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [primaryKey({ columns: [table.organizationId, table.userId] })],
);

/**
 * A member's own video room (a Meet, Zoom or Teams link they reuse), one per person and organization: the link of the
 * video interviews they run when the recruiter leaves "where" empty. It is sent to candidates, so it is not a secret.
 * Goes with the user (cascade) and is deleted when they leave the organization.
 */
export const videoRoom = pgTable(
  'video_room',
  {
    organizationId: organizationRef(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    url: text('url').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [primaryKey({ columns: [table.organizationId, table.userId] })],
);

/**
 * An interview the candidate books on their link. Only the hash of the secret is stored. At most one open interview
 * (proposed or booked) per application and stage. The row goes with its application (RESTRICT: the erasure deletes it).
 */
export const interview = pgTable(
  'interview',
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
    status: text('status').$type<InterviewStatus>().notNull(),
    durationMinutes: integer('duration_minutes').notNull(),
    mode: text('mode').$type<InterviewMode>().notNull(),
    location: text('location'),
    startsAt: timestamp('starts_at', { withTimezone: true }),
    endsAt: timestamp('ends_at', { withTimezone: true }),
    tokenHash: text('token_hash').notNull(),
    tokenExpiresAt: timestamp('token_expires_at', { withTimezone: true }).notNull(),
    /** Raised on every new time or cancellation, so calendars replace the earlier invite. */
    icsSequence: integer('ics_sequence').notNull().default(0),
    proposedBy: text('proposed_by').notNull(),
    bookedAt: timestamp('booked_at', { withTimezone: true }),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    /** `candidate`, or the user id of who cancelled. */
    cancelledBy: text('cancelled_by'),
    reminderSentAt: timestamp('reminder_sent_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('interview_token_hash_uidx').on(table.tokenHash),
    uniqueIndex('interview_open_per_stage_uidx')
      .on(table.organizationId, table.applicationId, table.stageId)
      .where(sql`${table.status} in ('proposed', 'booked')`),
    index('interview_org_application_idx').on(table.organizationId, table.applicationId),
    index('interview_org_status_starts_idx').on(table.organizationId, table.status, table.startsAt),
  ],
);

/** Who takes part, in order: members by user id (their address is read when sending), externals by name and email. */
export const interviewInterviewer = pgTable(
  'interview_interviewer',
  {
    organizationId: organizationRef(),
    interviewId: text('interview_id')
      .notNull()
      .references(() => interview.id, { onDelete: 'cascade' }),
    position: integer('position').notNull(),
    kind: text('kind').$type<InterviewerKind>().notNull(),
    userId: text('user_id'),
    email: text('email'),
    name: text('name').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.interviewId, table.position] }),
    index('interview_interviewer_org_user_idx').on(table.organizationId, table.userId),
  ],
);

export type CalendarFeedRow = typeof calendarFeed.$inferSelect;
export type InterviewRow = typeof interview.$inferSelect;
export type InterviewInterviewerRow = typeof interviewInterviewer.$inferSelect;
