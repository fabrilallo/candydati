import { sql } from '@candydati/db';
import type { ReportAggregateQuery, ReportAggregates } from '../report-ports.js';
import type { DbExecutor } from './db-executor.js';

interface AdvanceRow extends Record<string, unknown> {
  readonly job_id: string;
  readonly from_stage_id: string;
  readonly to_stage_id: string | null;
  readonly count: number;
}

/**
 * Cohort pairs of the funnel: applications that entered a stage in the period and later (same period) entered another
 * stage of the job or were hired. Counted per distinct application, so they never exceed the cohort of the first stage.
 */
export async function queryStageAdvances(db: DbExecutor, query: ReportAggregateQuery): Promise<ReportAggregates['stageAdvances']> {
  const from = query.from.toISOString();
  const to = query.to.toISOString();
  const job = query.jobId === undefined ? sql`` : sql`and a.job_id = ${query.jobId}`;
  const ids = query.jobIds;
  const jobs = ids === undefined ? sql`` : ids.length === 0 ? sql`and false` : sql`and a.job_id in (${sql.join(ids.map((id) => sql`${id}`), sql`, `)})`;
  const result = await db.execute<AdvanceRow>(sql`
    select a.job_id, a.to_stage_id as from_stage_id,
      case when b.outcome = 'hired' then null else b.to_stage_id end as to_stage_id,
      count(distinct a.application_id)::int as count
    from application_stage_event a
    join application_stage_event b
      on b.organization_id = a.organization_id and b.application_id = a.application_id
      and b.id <> a.id and b.occurred_at >= a.occurred_at
    where a.organization_id = ${query.organizationId} ${job} ${jobs}
      and a.to_stage_id is not null
      and a.occurred_at >= ${from}::timestamptz and a.occurred_at <= ${to}::timestamptz
      and b.occurred_at >= ${from}::timestamptz and b.occurred_at <= ${to}::timestamptz
      and (b.to_stage_id is not null or b.outcome = 'hired')
    group by 1, 2, 3`);
  return result.rows.map((row) => ({ jobId: row.job_id, fromStageId: row.from_stage_id, toStageId: row.to_stage_id, count: row.count }));
}
