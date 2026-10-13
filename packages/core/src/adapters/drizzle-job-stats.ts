import { and, asc, count, eq, gte, schema, sql, type Db, type SQL } from '@tt/db';
import { JOB_STATUSES, type JobStatus } from '@tt/domain';
import type { WeeklyActivity, WeeklyCount } from '../job-ports.js';

/** Aggregate queries behind the job overview. Every statement filters by `organization_id`. */

const { job } = schema;
type TimestampColumn = typeof job.createdAt | typeof job.publishedAt;

/** Monday (UTC) opening the week of `column`, as `YYYY-MM-DD`: `date_trunc('week')` truncates to ISO Mondays. */
const weekOf = (column: TimestampColumn): SQL<string> =>
  sql<string>`to_char(date_trunc('week', ${column} AT TIME ZONE 'UTC'), 'YYYY-MM-DD')`;

export async function countJobsByStatus(db: Db, organizationId: string): Promise<Record<JobStatus, number>> {
  const rows = await db
    .select({ status: job.status, total: count() })
    .from(job)
    .where(eq(job.organizationId, organizationId))
    .groupBy(job.status);
  const totals = new Map(rows.map((row) => [row.status, row.total]));
  return Object.fromEntries(JOB_STATUSES.map((status) => [status, totals.get(status) ?? 0])) as Record<JobStatus, number>;
}

async function weeklyCounts(db: Db, organizationId: string, column: TimestampColumn, since: Date): Promise<readonly WeeklyCount[]> {
  const week = weekOf(column);
  return db
    .select({ week, count: count() })
    .from(job)
    .where(and(eq(job.organizationId, organizationId), gte(column, since)))
    .groupBy(week)
    .orderBy(asc(week));
}

export async function jobWeeklyActivity(db: Db, organizationId: string, since: Date): Promise<WeeklyActivity> {
  const [created, published] = await Promise.all([
    weeklyCounts(db, organizationId, job.createdAt, since),
    weeklyCounts(db, organizationId, job.publishedAt, since),
  ]);
  return { created, published };
}
