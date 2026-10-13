import type { Job } from '../job/job.js';

export const HOUR_MS = 3_600_000;
export const DAY_MS = 24 * HOUR_MS;
/** Within this window of the deadline an application is `due_soon`. */
export const DUE_SOON_HOURS = 48;
/** Overdue by more than this many days: owners and admins are told too (escalation). */
export const ESCALATION_OVERDUE_DAYS = 2;

/** `on_track` > 48h left, `due_soon` <= 48h, `overdue` past, `answered` responded in this stage, `closed` decided. */
export const RESPONSE_STATES = ['on_track', 'due_soon', 'overdue', 'answered', 'closed'] as const;
export type ResponseState = (typeof RESPONSE_STATES)[number];

/** The states a person has to act on. */
export const ATTENTION_STATES = ['due_soon', 'overdue'] as const;
export type AttentionState = (typeof ATTENTION_STATES)[number];

export interface ResponseTracked {
  readonly outcome: string | null;
  readonly stageChangedAt: Date;
  readonly responseDueAt: Date | null;
  readonly respondedAt: Date | null;
}

/** Plain timestamp + N*24h; null when the job declares no response time (a draft). */
export function computeResponseDueAt(stageChangedAt: Date, job: Pick<Job, 'content'>): Date | null {
  const days = job.content.responseDays;
  return days === undefined ? null : new Date(stageChangedAt.getTime() + days * DAY_MS);
}

/** Pure: the state shown in the UI. A missing stored deadline is recomputed from the stage change and the job. */
export function responseState(application: ResponseTracked, job: Pick<Job, 'content'>, now: Date): ResponseState {
  if (application.outcome !== null) return 'closed';
  if (application.respondedAt !== null) return 'answered';
  const due = application.responseDueAt ?? computeResponseDueAt(application.stageChangedAt, job);
  if (due === null) return 'on_track';
  const left = due.getTime() - now.getTime();
  if (left < 0) return 'overdue';
  return left <= DUE_SOON_HOURS * HOUR_MS ? 'due_soon' : 'on_track';
}

/** True when `now` is more than the escalation threshold past the deadline. */
export const needsEscalation = (due: Date, now: Date): boolean => now.getTime() - due.getTime() > ESCALATION_OVERDUE_DAYS * DAY_MS;
