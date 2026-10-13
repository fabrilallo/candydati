/** Pure statistics for the reports. The same rules are used by the in-memory adapter and mirrored by the SQL one. */

/** Under this many cases (the denominator) a rate is not meaningful: the interface shows "—". */
export const REPORT_MIN_SAMPLE = 5;

/** Linear interpolation between the closest ranks, like Postgres `percentile_cont`. Null for an empty list. */
export function percentile(values: readonly number[], fraction: number): number | null {
  if (values.length === 0) return null;
  const sorted = values.toSorted((a, b) => a - b);
  const position = (sorted.length - 1) * fraction;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  const low = sorted[lower] as number;
  const high = sorted[upper] as number;
  return low + (high - low) * (position - lower);
}

export const roundTo = (value: number, decimals: number): number => {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
};

export const median = (values: readonly number[]): number | null => percentile(values, 0.5);
export const p75 = (values: readonly number[]): number | null => percentile(values, 0.75);

/** Count, median and 75th percentile of a duration (days or hours, decided by the caller), rounded to 2 decimals. */
export interface DurationStat {
  readonly count: number;
  readonly median: number | null;
  readonly p75: number | null;
}

export const EMPTY_DURATION: DurationStat = { count: 0, median: null, p75: null };

export function durationStat(values: readonly number[]): DurationStat {
  const mid = median(values);
  const top = p75(values);
  return { count: values.length, median: mid === null ? null : roundTo(mid, 2), p75: top === null ? null : roundTo(top, 2) };
}

/** A rate always travels with its numerator and denominator. `rate` is 0..1 with 4 decimals, null when `total` is 0. */
export interface Rate {
  readonly count: number;
  readonly total: number;
  readonly rate: number | null;
}

export const rate = (count: number, total: number): Rate => ({ count, total, rate: total === 0 ? null : roundTo(count / total, 4) });

/** True when the denominator is too small to show a rate. */
export const isSmallSample = (total: number): boolean => total < REPORT_MIN_SAMPLE;
