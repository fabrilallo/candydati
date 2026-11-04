import { DAY_MS } from '@candydati/domain';

/** Dates of the demo are relative to the moment it runs, so the pipeline always looks current. */
export const daysBefore = (now: Date, days: number): Date => new Date(now.getTime() - days * DAY_MS);
export const daysAfter = (now: Date, days: number): Date => new Date(now.getTime() + days * DAY_MS);

/** `YYYY-MM-DD` (UTC), the format of the date-only columns. */
export const isoDay = (date: Date): string => date.toISOString().slice(0, 10);
