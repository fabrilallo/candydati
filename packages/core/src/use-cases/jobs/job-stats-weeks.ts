import { DAY_MS } from '@tt/domain';
import type { JobStatsDto } from '@tt/domain';
import type { WeeklyActivity, WeeklyCount } from '../../job-ports.js';
import { groupBy } from './group-by.js';

const WEEK_MS = 7 * DAY_MS;

/** Midnight UTC of the Monday that opens the week of `date`. */
function mondayOf(date: Date): Date {
  const midnight = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  const daysSinceMonday = (new Date(midnight).getUTCDay() + 6) % 7;
  return new Date(midnight - daysSinceMonday * DAY_MS);
}

/** `YYYY-MM-DD` of the Monday (UTC) that opens the week of `date`. */
export const weekStartOf = (date: Date): string => mondayOf(date).toISOString().slice(0, 10);

/** Midnight UTC of the Monday opening the oldest of `weeks` weeks that end with the week of `now`. */
export const firstWeekStart = (now: Date, weeks: number): Date => new Date(mondayOf(now).getTime() - (weeks - 1) * WEEK_MS);

/** `weeks` week starts, oldest first, the week of `now` last. */
export function weekStarts(now: Date, weeks: number): readonly string[] {
  const first = firstWeekStart(now, weeks).getTime();
  return Array.from({ length: weeks }, (_, i) => new Date(first + i * WEEK_MS).toISOString().slice(0, 10));
}

/** Counts the non-null dates `>= since` per week, oldest week first. */
export function bucketByWeek(dates: readonly (Date | null)[], since: Date): readonly WeeklyCount[] {
  const weeks = dates.filter((date): date is Date => date !== null && date.getTime() >= since.getTime()).map(weekStartOf);
  return [...groupBy(weeks, (week) => week).entries()]
    .map(([week, items]) => ({ week, count: items.length }))
    .toSorted((a, b) => a.week.localeCompare(b.week));
}

const toMap = (counts: readonly WeeklyCount[]): ReadonlyMap<string, number> => new Map(counts.map((c) => [c.week, c.count]));

/** One entry per week start, zero when the week had no activity; weeks outside `starts` are dropped. */
export function fillWeeks(starts: readonly string[], activity: WeeklyActivity): JobStatsDto['weekly'] {
  const created = toMap(activity.created);
  const published = toMap(activity.published);
  return starts.map((weekStart) => ({ weekStart, created: created.get(weekStart) ?? 0, published: published.get(weekStart) ?? 0 }));
}
