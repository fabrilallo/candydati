import {
  COVERAGE_JOB_AGE_DAYS,
  DAY_MS,
  durationStat,
  OUTCOMES,
  rate,
  REPORT_MIN_SAMPLE,
  type FunnelStageType,
  type Job,
  type JobRef,
  type OutcomeCounts,
  type ReportsDto,
} from '@tt/domain';
import type { ReportAggregates } from '../../report-ports.js';
import { buildFunnel, stageTypesOf } from './funnel.js';

export interface ReportInput {
  readonly aggregates: ReportAggregates;
  /** Published and closed jobs of the organization (drafts have no applications). */
  readonly jobs: readonly Job[];
  readonly jobId: string | null;
  readonly from: Date;
  readonly to: Date;
  readonly now: Date;
}

const byTitle = <T extends JobRef>(a: T, b: T): number => a.title.localeCompare(b.title) || a.jobId.localeCompare(b.jobId);

const refOf = (jobs: ReadonlyMap<string, Job>, jobId: string): JobRef => ({ jobId, title: jobs.get(jobId)?.content.title ?? jobId });

const roundDays = (ms: number): number => Math.round((ms / DAY_MS) * 100) / 100;

function buildTimeToFill(input: ReportInput, jobs: ReadonlyMap<string, Job>): ReportsDto['timeToFill'] {
  const items = input.aggregates.firstHires.flatMap((row) => {
    const publishedAt = jobs.get(row.jobId)?.publishedAt ?? null;
    if (publishedAt === null) return [];
    return [{ ...refOf(jobs, row.jobId), publishedAt: publishedAt.toISOString(), firstHireAt: row.firstHireAt.toISOString(), days: roundDays(row.firstHireAt.getTime() - publishedAt.getTime()) }];
  });
  return { overall: durationStat(items.map((item) => item.days)), items: items.toSorted(byTitle) };
}

const emptyOutcomes = (): OutcomeCounts => ({ hired: 0, not_selected: 0, withdrawn: 0 });

function buildOutcomes(input: ReportInput, jobs: ReadonlyMap<string, Job>): ReportsDto['funnel']['outcomesByJob'] {
  const byJob = new Map<string, OutcomeCounts>();
  for (const row of input.aggregates.outcomes) byJob.set(row.jobId, { ...(byJob.get(row.jobId) ?? emptyOutcomes()), [row.outcome]: row.count });
  return [...byJob].map(([jobId, counts]) => ({ ...refOf(jobs, jobId), ...counts })).toSorted(byTitle);
}

function buildResponses(input: ReportInput, jobs: ReadonlyMap<string, Job>): ReportsDto['responses'] {
  const { promisesClosed, promisesWaiting, responseHours } = input.aggregates;
  const kept = promisesClosed.reduce((sum, row) => sum + row.kept, 0);
  const missed = promisesClosed.reduce((sum, row) => sum + row.missed, 0);
  const perJob = new Map<string, { kept: number; missed: number }>();
  const perType = new Map<FunnelStageType, { kept: number; missed: number }>();
  for (const row of promisesClosed) {
    const job = perJob.get(row.jobId) ?? { kept: 0, missed: 0 };
    perJob.set(row.jobId, { kept: job.kept + row.kept, missed: job.missed + row.missed });
    const type = jobs.get(row.jobId) ? stageTypesOf(jobs.get(row.jobId) as Job).get(row.stageId) : undefined;
    if (type === undefined) continue;
    const bucket = perType.get(type) ?? { kept: 0, missed: 0 };
    perType.set(type, { kept: bucket.kept + row.kept, missed: bucket.missed + row.missed });
  }
  return {
    closed: rate(kept, kept + missed),
    kept,
    missed,
    responseHours,
    open: promisesWaiting.reduce((sum, row) => sum + row.open, 0),
    overdue: promisesWaiting.reduce((sum, row) => sum + row.overdue, 0),
    byJob: [...perJob].map(([jobId, c]) => ({ ...refOf(jobs, jobId), ...c, keptRate: rate(c.kept, c.kept + c.missed) })).toSorted(byTitle),
    byStageType: [...perType]
      .map(([type, c]) => ({ type, ...c, keptRate: rate(c.kept, c.kept + c.missed) }))
      .toSorted((a, b) => a.type.localeCompare(b.type)),
  };
}

/** Closed, or published at least `COVERAGE_JOB_AGE_DAYS` days before `now`. */
const countsForCoverage = (job: Job | undefined, now: Date): boolean =>
  job !== undefined && (job.status === 'closed' || (job.publishedAt !== null && now.getTime() - job.publishedAt.getTime() >= COVERAGE_JOB_AGE_DAYS * DAY_MS));

function buildCoverage(input: ReportInput, jobs: ReadonlyMap<string, Job>): ReportsDto['outcomeCoverage'] {
  const rows = input.aggregates.coverage.filter((row) => countsForCoverage(jobs.get(row.jobId), input.now));
  return rate(rows.reduce((sum, row) => sum + row.decided, 0), rows.reduce((sum, row) => sum + row.total, 0));
}

/** Pure: turns the raw aggregates into the DTO, adding job titles, stage types and rates. */
export function buildReports(input: ReportInput): ReportsDto {
  const { aggregates, jobId } = input;
  const jobs = new Map(input.jobs.map((job) => [job.id, job]));
  const outcomesByJob = buildOutcomes(input, jobs);
  const outcomes = outcomesByJob.reduce<OutcomeCounts>(
    (sum, row) => Object.fromEntries(OUTCOMES.map((outcome) => [outcome, sum[outcome] + row[outcome]])) as OutcomeCounts,
    emptyOutcomes(),
  );
  return {
    generatedAt: input.now.toISOString(),
    period: { from: input.from.toISOString(), to: input.to.toISOString() },
    jobId,
    minSample: REPORT_MIN_SAMPLE,
    timeToHire: {
      overall: aggregates.hireDays.overall,
      byJob: aggregates.hireDays.byJob.map((row) => ({ ...refOf(jobs, row.jobId), ...row.stat })).toSorted(byTitle),
    },
    timeToFill: buildTimeToFill(input, jobs),
    funnel: { stages: buildFunnel(input.jobs, aggregates.stageEntries, aggregates.stageAdvances, jobId !== null), outcomes, outcomesByJob },
    sources: aggregates.origins.toSorted((a, b) => b.applications - a.applications || a.origin.localeCompare(b.origin)),
    responses: buildResponses(input, jobs),
    outcomeCoverage: buildCoverage(input, jobs),
  };
}
