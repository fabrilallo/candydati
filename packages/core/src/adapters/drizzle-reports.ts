import { and, eq, gte, isNotNull, lte, ne, schema, sql, type SQL } from '@tt/db';
import { EMPTY_DURATION, type DurationStat, type Outcome } from '@tt/domain';
import type { ReportAggregateQuery, ReportAggregates, ReportRepository } from '../report-ports.js';
import type { DbExecutor } from './db-executor.js';
import { queryStageAdvances } from './drizzle-report-funnel.js';

/**
 * Aggregates behind `getReports`, computed by Postgres. Every statement filters by `organization_id`; the period is closed on
 * both ends. Percentiles use `percentile_cont` (linear interpolation) and are rounded to 2 decimals, like the in-memory adapter.
 */
const { application, applicationStageEvent: stageEvent, responsePromise: promise } = schema;

type Column = Parameters<typeof eq>[0];

const ts = (date: Date): SQL => sql`${date.toISOString()}::timestamptz`;
const days = (from: SQL, to: SQL): SQL => sql`extract(epoch from (${to} - ${from})) / 86400.0`;
const hours = (from: SQL, to: SQL): SQL => sql`extract(epoch from (${to} - ${from})) / 3600.0`;
const percentile = (fraction: number, value: SQL): SQL<number | null> =>
  sql<number | null>`round((percentile_cont(${fraction}) within group (order by ${value}))::numeric, 2)::float8`;

const durationColumns = (value: SQL) => ({
  count: sql<number>`count(*)::int`,
  median: percentile(0.5, value),
  p75: percentile(0.75, value),
});

const toStat = (row: DurationStat | undefined): DurationStat => (row && row.count > 0 ? { count: row.count, median: row.median, p75: row.p75 } : EMPTY_DURATION);

export function createDrizzleReports(db: DbExecutor): ReportRepository {
  const scope = (query: ReportAggregateQuery, columns: { organizationId: Column; jobId: Column }) =>
    and(eq(columns.organizationId, query.organizationId), query.jobId === undefined ? undefined : eq(columns.jobId, query.jobId));
  return {
    async aggregate(query): Promise<ReportAggregates> {
      const { from, to, now } = query;
      const inApplication = scope(query, application);
      const inEvent = scope(query, stageEvent);
      const inPromise = scope(query, promise);
      const hiredInPeriod = and(inApplication, eq(application.outcome, 'hired'), gte(application.closedAt, from), lte(application.closedAt, to));
      const hireValue = days(sql`${application.createdAt}`, sql`${application.closedAt}`);
      const closureAt = sql`coalesce(${promise.respondedAt}, ${promise.dueAt})`;
      const closedInPeriod = and(inPromise, ne(promise.status, 'open'), sql`${closureAt} >= ${ts(from)}`, sql`${closureAt} <= ${ts(to)}`);
      const createdInPeriod = and(inApplication, gte(application.createdAt, from), lte(application.createdAt, to));

      const [hireOverall, hireByJob, firstHires, stageEntries, stageAdvances, outcomes, origins, promisesClosed, responseHours, promisesWaiting, coverage] = await Promise.all([
        db.select(durationColumns(hireValue)).from(application).where(hiredInPeriod),
        db.select({ jobId: application.jobId, ...durationColumns(hireValue) }).from(application).where(hiredInPeriod).groupBy(application.jobId),
        db
          .select({ jobId: application.jobId, firstHireAt: sql`min(${application.closedAt})`.mapWith(application.closedAt) })
          .from(application)
          .where(and(inApplication, eq(application.outcome, 'hired'), isNotNull(application.closedAt)))
          .groupBy(application.jobId)
          .having(sql`min(${application.closedAt}) >= ${ts(from)} and min(${application.closedAt}) <= ${ts(to)}`),
        db
          .select({ jobId: stageEvent.jobId, stageId: sql<string>`${stageEvent.toStageId}`, entered: sql<number>`count(distinct ${stageEvent.applicationId})::int` })
          .from(stageEvent)
          .where(and(inEvent, isNotNull(stageEvent.toStageId), gte(stageEvent.occurredAt, from), lte(stageEvent.occurredAt, to)))
          .groupBy(stageEvent.jobId, stageEvent.toStageId),
        queryStageAdvances(db, query),
        db
          .select({ jobId: stageEvent.jobId, outcome: sql<Outcome>`${stageEvent.outcome}`, count: sql<number>`count(*)::int` })
          .from(stageEvent)
          .where(and(inEvent, isNotNull(stageEvent.outcome), gte(stageEvent.occurredAt, from), lte(stageEvent.occurredAt, to)))
          .groupBy(stageEvent.jobId, stageEvent.outcome),
        db
          .select({
            origin: application.origin,
            applications: sql<number>`(count(*) filter (where ${application.createdAt} >= ${ts(from)} and ${application.createdAt} <= ${ts(to)}))::int`,
            hires: sql<number>`(count(*) filter (where ${application.outcome} = 'hired' and ${application.closedAt} >= ${ts(from)} and ${application.closedAt} <= ${ts(to)}))::int`,
          })
          .from(application)
          .where(inApplication)
          .groupBy(application.origin),
        db
          .select({
            jobId: promise.jobId,
            stageId: promise.stageId,
            kept: sql<number>`(count(*) filter (where ${promise.status} = 'kept'))::int`,
            missed: sql<number>`(count(*) filter (where ${promise.status} = 'missed'))::int`,
          })
          .from(promise)
          .where(closedInPeriod)
          .groupBy(promise.jobId, promise.stageId),
        db
          .select(durationColumns(hours(sql`${promise.startedAt}`, sql`${promise.respondedAt}`)))
          .from(promise)
          .where(and(closedInPeriod, isNotNull(promise.respondedAt))),
        db
          .select({
            jobId: promise.jobId,
            open: sql<number>`count(*)::int`,
            overdue: sql<number>`(count(*) filter (where ${promise.dueAt} < ${ts(now)}))::int`,
          })
          .from(promise)
          .where(and(inPromise, sql`${promise.respondedAt} is null`))
          .groupBy(promise.jobId),
        db
          .select({
            jobId: application.jobId,
            total: sql<number>`count(*)::int`,
            decided: sql<number>`(count(*) filter (where ${application.outcome} is not null))::int`,
          })
          .from(application)
          .where(createdInPeriod)
          .groupBy(application.jobId),
      ]);
      return {
        hireDays: { overall: toStat(hireOverall[0]), byJob: hireByJob.map(({ jobId, ...stat }) => ({ jobId, stat: toStat(stat) })) },
        firstHires: firstHires.map((row) => ({ jobId: row.jobId, firstHireAt: row.firstHireAt as Date })),
        stageEntries,
        stageAdvances,
        outcomes,
        origins: origins.filter((row) => row.applications + row.hires > 0),
        promisesClosed,
        responseHours: toStat(responseHours[0]),
        promisesWaiting,
        coverage,
      };
    },
  };
}
