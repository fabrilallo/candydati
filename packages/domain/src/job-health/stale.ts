import { DAY_MS } from '../response/response-state.js';

/** A published ad with no activity for this many days is reported to the company, never closed automatically. */
export const STALE_JOB_DAYS = 90;

export interface StalenessInput {
  readonly publishedAt: Date | null;
  /** Last content edit (and the publication itself). */
  readonly updatedAt: Date;
  /** Latest of: application received, move, decision. Null when the job never had any. */
  readonly lastApplicationActivityAt: Date | null;
}

/** The last of publication, content update, new application, move or decision. */
export function lastJobActivityAt(input: StalenessInput): Date {
  const times = [input.publishedAt, input.updatedAt, input.lastApplicationActivityAt].filter((value): value is Date => value !== null);
  return new Date(Math.max(...times.map((time) => time.getTime())));
}

export const staleCutoff = (now: Date): Date => new Date(now.getTime() - STALE_JOB_DAYS * DAY_MS);

export const isStaleJob = (lastActivityAt: Date, now: Date): boolean => lastActivityAt <= staleCutoff(now);

export const daysSince = (date: Date, now: Date): number => Math.floor((now.getTime() - date.getTime()) / DAY_MS);

/**
 * One notification per staleness period: the period is identified by the last activity, so a new activity starts a new
 * period and the ad can be reported again once it goes quiet for another 90 days.
 */
export const staleJobDedupeKey = (jobId: string, lastActivityAt: Date): string => `job_stale:${jobId}:${lastActivityAt.toISOString()}`;
