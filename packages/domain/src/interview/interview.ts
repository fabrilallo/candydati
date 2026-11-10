import { z } from 'zod';
import { INTERVIEWERS_PER_STAGE_MAX, interviewerInputSchema } from '../feedback/feedback.js';
import { isTimeZone } from './time-zone.js';
import { workingHoursSchema } from './availability.js';

/** How far ahead a candidate may book, how much notice the interviewers get, and the grid of start times. */
export const INTERVIEW_HORIZON_DAYS = 14;
export const INTERVIEW_MIN_NOTICE_MINUTES = 24 * 60;
export const INTERVIEW_STEP_MINUTES = 30;
/** A candidate may move or cancel until this long before the start; after that they write to the recruiter. */
export const INTERVIEW_CHANGE_CUTOFF_MINUTES = 12 * 60;
/** Times offered in the invitation email, each a link to the page with that time chosen. */
export const INTERVIEW_EMAIL_SLOTS = 3;
/** The candidate is reminded this long before the start. */
export const INTERVIEW_REMINDER_MINUTES = 24 * 60;
export const INTERVIEW_LOCATION_MAX = 500;
export const INTERVIEW_CANCEL_REASON_MAX = 500;
/** Busy times read from a feed are kept for this many days ahead, never further. */
export const CALENDAR_BUSY_HORIZON_DAYS = INTERVIEW_HORIZON_DAYS + 1;
export const CALENDAR_FEED_URL_MAX = 2048;

export const INTERVIEW_STATUSES = ['proposed', 'booked', 'cancelled'] as const;
export type InterviewStatus = (typeof INTERVIEW_STATUSES)[number];

export const INTERVIEW_MODES = ['video', 'onsite', 'phone'] as const;
export type InterviewMode = (typeof INTERVIEW_MODES)[number];

/** Why a calendar link could not be read; the link itself is never shown back. */
export const CALENDAR_FEED_ERRORS = ['unreachable', 'not_calendar', 'too_large', 'not_allowed'] as const;
export type CalendarFeedError = (typeof CALENDAR_FEED_ERRORS)[number];

export const timeZoneSchema = z.string().min(1).max(64).refine(isTimeZone, 'unknown_time_zone');

/** A secret iCal address: https, or webcal (read as https). */
export const calendarFeedUrlSchema = z
  .string()
  .trim()
  .max(CALENDAR_FEED_URL_MAX)
  .transform((value) => value.replace(/^webcals?:\/\//i, 'https://'))
  .pipe(z.url({ protocol: /^https$/, hostname: z.regexes.domain }));

export const calendarFeedInputSchema = z.object({
  url: calendarFeedUrlSchema,
  timeZone: timeZoneSchema,
  workingHours: workingHoursSchema,
});
export type CalendarFeedInput = z.infer<typeof calendarFeedInputSchema>;

/** Working hours and time zone changed without pasting the link again. */
export const calendarPreferencesInputSchema = calendarFeedInputSchema.omit({ url: true });
export type CalendarPreferencesInput = z.infer<typeof calendarPreferencesInputSchema>;

export const proposeInterviewInputSchema = z
  .object({
    stageId: z.string().min(1),
    /** Defaults to the stage's interviewers. */
    interviewers: z.array(interviewerInputSchema).min(1).max(INTERVIEWERS_PER_STAGE_MAX).optional(),
    mode: z.enum(INTERVIEW_MODES),
    location: z.string().trim().max(INTERVIEW_LOCATION_MAX).optional(),
  })
  .strict();
export type ProposeInterviewInput = z.infer<typeof proposeInterviewInputSchema>;

export const bookInterviewInputSchema = z.object({ slot: z.iso.datetime() }).strict();
export type BookInterviewInput = z.infer<typeof bookInterviewInputSchema>;

export const cancelInterviewInputSchema = z
  .object({ reason: z.string().trim().max(INTERVIEW_CANCEL_REASON_MAX).optional() })
  .strict();
export type CancelInterviewInput = z.infer<typeof cancelInterviewInputSchema>;

/** The path of the candidate's booking page; `slot` preselects a time and never books by itself. */
export const interviewPath = (token: string, slot?: Date): string =>
  `/interview/${token}${slot ? `?slot=${encodeURIComponent(slot.toISOString())}` : ''}`;

/** True when the candidate may still move or cancel a booked interview. */
export const canCandidateChange = (startsAt: Date, now: Date): boolean =>
  startsAt.getTime() - now.getTime() >= INTERVIEW_CHANGE_CUTOFF_MINUTES * 60_000;
