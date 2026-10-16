import { and, eq, gte, inArray, lte, schema, sql, type SQL } from '@candydati/db';
import { viewDay } from '@candydati/domain';
import type { ReportAggregateQuery, ReportAggregates } from '../report-ports.js';
import type { DbExecutor } from './db-executor.js';

const { application, jobViewDaily } = schema;

const ts = (date: Date): SQL => sql`${date.toISOString()}::timestamptz`;

type Column = Parameters<typeof eq>[0];

const scope = (query: ReportAggregateQuery, columns: { organizationId: Column; jobId: Column }) =>
  and(
    eq(columns.organizationId, query.organizationId),
    query.jobId === undefined ? undefined : eq(columns.jobId, query.jobId),
    query.jobIds === undefined ? undefined : inArray(columns.jobId, [...query.jobIds]),
  );

/** Applications received and hires decided in the period, by origin and (separately) by origin and campaign. */
export async function querySources(db: DbExecutor, query: ReportAggregateQuery): Promise<Pick<ReportAggregates, 'origins' | 'campaigns'>> {
  const { from, to } = query;
  const counts = {
    applications: sql<number>`(count(*) filter (where ${application.createdAt} >= ${ts(from)} and ${application.createdAt} <= ${ts(to)}))::int`,
    hires: sql<number>`(count(*) filter (where ${application.outcome} = 'hired' and ${application.closedAt} >= ${ts(from)} and ${application.closedAt} <= ${ts(to)}))::int`,
  };
  const inApplication = scope(query, application);
  const [origins, campaigns] = await Promise.all([
    db.select({ origin: application.origin, ...counts }).from(application).where(inApplication).groupBy(application.origin),
    db
      .select({ origin: application.origin, campaign: sql<string>`${application.originCampaign}`, ...counts })
      .from(application)
      .where(and(inApplication, sql`${application.originCampaign} is not null and ${application.originCampaign} <> ''`))
      .groupBy(application.origin, application.originCampaign),
  ]);
  return {
    origins: origins.filter((row) => row.applications + row.hires > 0),
    campaigns: campaigns.filter((row) => row.applications + row.hires > 0),
  };
}

/** Visits of the public job page on the (UTC) days of the period, by source and campaign. */
export async function queryVisits(db: DbExecutor, query: ReportAggregateQuery): Promise<ReportAggregates['visits']> {
  const rows = await db
    .select({ origin: jobViewDaily.source, campaign: jobViewDaily.campaign, visits: sql<number>`sum(${jobViewDaily.views})::int` })
    .from(jobViewDaily)
    .where(and(scope(query, jobViewDaily), gte(jobViewDaily.day, viewDay(query.from)), lte(jobViewDaily.day, viewDay(query.to))))
    .groupBy(jobViewDaily.source, jobViewDaily.campaign);
  return rows;
}
