import { z } from 'zod';
import { DAY_MS } from '../response/response-state.js';

/** Calendar bounds of the two dates of a hire. */
export const HIRE_DATE_MIN = '2000-01-01';
export const HIRE_DATE_MAX = '2100-12-31';

/** A date without a time (`YYYY-MM-DD`): a real calendar day inside the bounds. */
export const hireDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'date_only')
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value);
  }, 'date_invalid')
  .refine((value) => value >= HIRE_DATE_MIN && value <= HIRE_DATE_MAX, 'date_out_of_bounds');

/** The two optional dates of a hired application. `null` clears one; absent leaves it as it is. */
export const hireDatesSchema = z.object({
  /** The day the candidate accepted the offer. */
  offerAcceptedOn: hireDateSchema.nullable().optional(),
  /** The day the candidate starts (or started) working. */
  startOn: hireDateSchema.nullable().optional(),
});
export type HireDatesInput = z.infer<typeof hireDatesSchema>;

/** The dates as stored on the application. */
export interface HireDates {
  readonly offerAcceptedOn: string | null;
  readonly startOn: string | null;
}

export type HireDatesIssue = 'offer_before_application' | 'start_before_offer' | 'start_before_application';

/** The UTC calendar day of a timestamp, `YYYY-MM-DD`. */
export const utcDay = (at: Date): string => at.toISOString().slice(0, 10);

/** Whole days from the UTC day of `from` to a date-only value. */
export const daysBetweenDates = (from: Date, on: string): number =>
  Math.round((Date.parse(`${on}T00:00:00Z`) - Date.parse(`${utcDay(from)}T00:00:00Z`)) / DAY_MS);

/**
 * The order the dates must keep: application day <= offer accepted <= start. Without an offer date the start is checked
 * against the application day. Returns the first issue found, null when fine.
 */
export function checkHireDates(appliedAt: Date, dates: HireDates): HireDatesIssue | null {
  const applied = utcDay(appliedAt);
  if (dates.offerAcceptedOn !== null && dates.offerAcceptedOn < applied) return 'offer_before_application';
  if (dates.offerAcceptedOn !== null && dates.startOn !== null && dates.startOn < dates.offerAcceptedOn) return 'start_before_offer';
  if (dates.startOn !== null && dates.startOn < applied) return 'start_before_application';
  return null;
}
