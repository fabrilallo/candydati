import type { FunnelStageDto, Outcome, ReportsDto, ResponsePromise, StageEvent } from '@candydati/domain';
import type { ApplicationRepository, CandidateRepository } from '../candidate-ports.js';
import type { JobRepository } from '../job-ports.js';
import type { ResponsePromiseRepository, StageEventRepository } from '../report-ports.js';
import { buildApplication, buildCandidate } from './candidate-fixtures.js';
import { buildJob, completeJobContent } from './job-fixtures.js';

/** Repositories the dataset is written through: the same code seeds the in-memory and the Postgres adapter. */
export interface DatasetRepositories {
  readonly jobs: JobRepository;
  readonly candidates: CandidateRepository;
  readonly applications: ApplicationRepository;
  readonly stageEvents: StageEventRepository;
  readonly promises: ResponsePromiseRepository;
}

/** The reports are asked for June 2026; "now" is the first instant of July. */
export const REPORT_FROM = new Date('2026-06-01T00:00:00Z');
export const REPORT_TO = new Date('2026-06-30T23:59:59Z');
export const REPORT_NOW = new Date('2026-07-01T00:00:00Z');

const at = (s: string): Date => new Date(`2026-${s}:00Z`);
const stage = (type: 'hr_interview' | 'technical_interview') => ({ type, durationMinutes: 30, conductedBy: 'recruiter' as const });

export interface DatasetIds {
  readonly backend: string;
  readonly frontend: string;
  readonly closed: string;
}

interface App {
  readonly key: string;
  readonly job: keyof DatasetIds;
  readonly created: string;
  readonly origin: string;
  /** Stage entries `[stage, time]` (`received` included), then optionally the decision. */
  readonly entries: readonly (readonly [string, string])[];
  readonly decision?: readonly [Outcome, string];
}

/**
 * Backend (3 stages, published 04-01), Frontend (2 stages, published 06-10) and a closed role (2 stages, published 03-01), 16
 * applications entering stages and being decided on known dates, 13 response promises. See `expectedReports`.
 */
const APPS: readonly App[] = [
  { key: 'a1', job: 'backend', created: '06-02T10:00', origin: 'linkedin', entries: [['received', '06-02T10:00'], ['stage-0', '06-04T10:00'], ['stage-1', '06-10T10:00']], decision: ['hired', '06-12T10:00'] },
  { key: 'a2', job: 'backend', created: '06-03T00:00', origin: 'linkedin', entries: [['received', '06-03T00:00'], ['stage-0', '06-05T00:00']], decision: ['hired', '06-23T00:00'] },
  { key: 'a3', job: 'backend', created: '06-05T12:00', origin: 'google.com', entries: [['received', '06-05T12:00'], ['stage-0', '06-06T12:00']], decision: ['not_selected', '06-07T12:00'] },
  { key: 'a4', job: 'backend', created: '06-06T12:00', origin: 'direct', entries: [['received', '06-06T12:00']], decision: ['withdrawn', '06-08T12:00'] },
  { key: 'a5', job: 'backend', created: '05-20T10:00', origin: 'referral', entries: [['received', '05-20T10:00'], ['stage-0', '06-02T10:00'], ['stage-1', '06-03T10:00']], decision: ['hired', '06-04T10:00'] },
  { key: 'a6', job: 'backend', created: '06-15T10:00', origin: 'linkedin', entries: [['received', '06-15T10:00']] },
  { key: 'b1', job: 'frontend', created: '06-11T10:00', origin: 'linkedin', entries: [['received', '06-11T10:00'], ['stage-0', '06-12T10:00']], decision: ['hired', '06-14T10:00'] },
  // Imported: no `received` event, it enters the first stage directly.
  { key: 'b2', job: 'frontend', created: '06-12T10:00', origin: 'import', entries: [['stage-0', '06-13T10:00']] },
  { key: 'c0', job: 'closed', created: '03-10T10:00', origin: 'manual', entries: [['received', '03-10T10:00']], decision: ['hired', '04-01T10:00'] },
  { key: 'c1', job: 'closed', created: '06-02T10:00', origin: 'direct', entries: [['received', '06-02T10:00'], ['stage-0', '06-03T10:00']], decision: ['not_selected', '06-09T10:00'] },
  { key: 'c2', job: 'closed', created: '05-25T10:00', origin: 'direct', entries: [['received', '05-25T10:00']], decision: ['withdrawn', '06-01T10:00'] },
  { key: 'c3', job: 'closed', created: '06-20T10:00', origin: 'direct', entries: [['received', '06-20T10:00']] },
  { key: 'c4', job: 'closed', created: '06-10T10:00', origin: 'direct', entries: [['received', '06-10T10:00']], decision: ['hired', '06-18T10:00'] },
];

type Pr = readonly [app: string, stage: string, started: string, due: string, responded: string | null, status: ResponsePromise['status']];
const PROMISES: readonly Pr[] = [
  ['a1', 'received', '06-02T10:00', '06-07T10:00', '06-04T10:00', 'kept'],
  ['a1', 'stage-0', '06-04T10:00', '06-09T10:00', '06-10T10:00', 'missed'],
  ['a2', 'received', '06-03T00:00', '06-08T00:00', '06-05T00:00', 'kept'],
  ['a3', 'received', '06-05T12:00', '06-10T12:00', '06-06T12:00', 'kept'],
  ['a4', 'received', '06-06T12:00', '06-11T12:00', '06-08T12:00', 'kept'],
  ['a6', 'received', '06-15T10:00', '06-20T10:00', null, 'missed'],
  ['a5', 'stage-0', '06-02T10:00', '06-07T10:00', '06-03T10:00', 'kept'],
  ['a5', 'received', '05-20T10:00', '05-25T10:00', '05-22T10:00', 'kept'],
  ['b1', 'received', '06-11T10:00', '06-16T10:00', '06-12T10:00', 'kept'],
  ['b2', 'received', '06-12T10:00', '06-17T10:00', null, 'open'],
  ['c1', 'received', '06-02T10:00', '06-07T10:00', '06-03T10:00', 'kept'],
  ['c3', 'received', '06-20T10:00', '07-05T10:00', null, 'open'],
  ['c4', 'received', '06-10T10:00', '06-15T10:00', '06-18T10:00', 'missed'],
];

const JOBS = {
  backend: { title: 'Backend Developer', status: 'published' as const, publishedAt: at('04-01T00:00'), process: [stage('hr_interview'), stage('technical_interview')], closedAt: null },
  frontend: { title: 'Frontend Developer', status: 'published' as const, publishedAt: at('06-10T00:00'), process: [stage('hr_interview')], closedAt: null },
  closed: { title: 'Closed role', status: 'closed' as const, publishedAt: at('03-01T00:00'), process: [stage('technical_interview')], closedAt: at('05-01T00:00') },
};

/** Writes one organization's dataset. `tag` makes every id unique, so several worlds can share a database. */
export async function seedReportDataset(repos: DatasetRepositories, organizationId: string, tag: string): Promise<DatasetIds> {
  const ids: DatasetIds = { backend: `${tag}-job-backend`, frontend: `${tag}-job-frontend`, closed: `${tag}-job-closed` };
  for (const key of Object.keys(JOBS) as (keyof DatasetIds)[]) {
    const spec = JOBS[key];
    await repos.jobs.create(
      buildJob({ id: ids[key], organizationId, slug: `${tag}-${key}`, status: spec.status, publishedAt: spec.publishedAt, closedAt: spec.closedAt, content: completeJobContent({ title: spec.title, process: spec.process }) }),
    );
  }
  for (const app of APPS) {
    const id = `${tag}-${app.key}`;
    const candidateId = `${tag}-cand-${app.key}`;
    await repos.candidates.create(buildCandidate({ id: candidateId, organizationId, email: `${tag}.${app.key}@example.org` }));
    const [outcome, closedAt] = app.decision ?? [null, null];
    const last = app.entries.at(-1) as readonly [string, string];
    await repos.applications.create(
      buildApplication({
        id, organizationId, jobId: ids[app.job], candidateId, stageId: last[0], outcome, origin: app.origin,
        createdAt: at(app.created), updatedAt: at(app.created), stageChangedAt: at(last[1]), closedAt: closedAt === null ? null : at(closedAt),
      }),
    );
    let previous: string | null = null;
    for (const [stageId, time] of app.entries) {
      await repos.stageEvents.record(event(`${id}-${stageId}`, organizationId, id, ids[app.job], previous, stageId, null, at(time)));
      previous = stageId;
    }
    if (app.decision) await repos.stageEvents.record(event(`${id}-decision`, organizationId, id, ids[app.job], previous, null, app.decision[0], at(app.decision[1])));
  }
  for (const [index, [appKey, stageId, started, due, responded, status]] of PROMISES.entries()) {
    const app = APPS.find((a) => a.key === appKey) as App;
    await repos.promises.create({
      id: `${tag}-p${index}`, organizationId, applicationId: `${tag}-${appKey}`, jobId: ids[app.job], stageId,
      startedAt: at(started), dueAt: at(due), respondedAt: responded === null ? null : at(responded), status, backfilled: false,
    });
  }
  return ids;
}

const event = (id: string, organizationId: string, applicationId: string, jobId: string, from: string | null, to: string | null, outcome: Outcome | null, occurredAt: Date): StageEvent => ({
  id, organizationId, applicationId, jobId, fromStageId: from, toStageId: to, outcome, occurredAt, actorType: 'user', backfilled: false,
});

const r = (count: number, total: number, rate: number) => ({ count, total, rate });
const st = (position: number, stageId: string, type: FunnelStageDto['type'], entered: number, conversionToNext: FunnelStageDto['conversionToNext']): FunnelStageDto => ({
  position, stageId, title: null, type, entered, conversionToNext,
});

/**
 * Funnel of each job (job filter), worked out by hand as cohorts: of the applications that entered a stage in June, how
 * many later entered the next stage (or were hired after the last). `b2` is imported and enters `stage-0` with no `received`
 * event, so it is not in the `received` cohort. `a5` entered `received` in May, so it is not either.
 */
export function expectedJobFunnels(): { readonly backend: readonly FunnelStageDto[]; readonly frontend: readonly FunnelStageDto[]; readonly closed: readonly FunnelStageDto[] } {
  return {
    backend: [st(0, 'received', 'received', 5, r(3, 5, 0.6)), st(1, 'stage-0', 'hr_interview', 4, r(2, 4, 0.5)), st(2, 'stage-1', 'technical_interview', 2, r(2, 2, 1))],
    frontend: [st(0, 'received', 'received', 1, r(1, 1, 1)), st(1, 'stage-0', 'hr_interview', 2, r(1, 2, 0.5))],
    closed: [st(0, 'received', 'received', 3, r(1, 3, 0.3333)), st(1, 'stage-0', 'technical_interview', 1, r(0, 1, 0))],
  };
}

const stat = (count: number, median: number, p75: number) => ({ count, median, p75 });

/** Every number of the dataset for the whole organization, worked out by hand (see the comments in `get-reports.test.ts`). */
export function expectedReports(ids: DatasetIds): ReportsDto {
  const b = { jobId: ids.backend, title: 'Backend Developer' };
  const c = { jobId: ids.closed, title: 'Closed role' };
  const f = { jobId: ids.frontend, title: 'Frontend Developer' };
  return {
    generatedAt: REPORT_NOW.toISOString(),
    period: { from: REPORT_FROM.toISOString(), to: REPORT_TO.toISOString() },
    jobId: null,
    minSample: 5,
    timeToHire: {
      overall: stat(5, 10, 15),
      byJob: [{ ...b, ...stat(3, 15, 17.5) }, { ...c, ...stat(1, 8, 8) }, { ...f, ...stat(1, 3, 3) }],
    },
    timeToFill: {
      overall: stat(2, 34.42, 49.42),
      items: [
        { ...b, publishedAt: at('04-01T00:00').toISOString(), firstHireAt: at('06-04T10:00').toISOString(), days: 64.42 },
        { ...f, publishedAt: at('06-10T00:00').toISOString(), firstHireAt: at('06-14T10:00').toISOString(), days: 4.42 },
      ],
    },
    funnel: {
      stages: [
        { position: null, stageId: null, title: null, type: 'received', entered: 9, conversionToNext: r(5, 9, 0.5556) },
        { position: null, stageId: null, title: null, type: 'hr_interview', entered: 6, conversionToNext: r(3, 6, 0.5) },
        { position: null, stageId: null, title: null, type: 'technical_interview', entered: 3, conversionToNext: r(2, 3, 0.6667) },
      ],
      outcomes: { hired: 5, not_selected: 2, withdrawn: 2 },
      outcomesByJob: [
        { ...b, hired: 3, not_selected: 1, withdrawn: 1 },
        { ...c, hired: 1, not_selected: 1, withdrawn: 1 },
        { ...f, hired: 1, not_selected: 0, withdrawn: 0 },
      ],
    },
    sources: [
      { origin: 'direct', applications: 4, hires: 1 },
      { origin: 'linkedin', applications: 4, hires: 3 },
      { origin: 'google.com', applications: 1, hires: 0 },
      { origin: 'import', applications: 1, hires: 0 },
      { origin: 'referral', applications: 0, hires: 1 },
    ],
    responses: {
      closed: r(7, 10, 0.7),
      kept: 7,
      missed: 3,
      responseHours: stat(9, 48, 48),
      open: 3,
      overdue: 2,
      byJob: [
        { ...b, kept: 5, missed: 2, keptRate: r(5, 7, 0.7143) },
        { ...c, kept: 1, missed: 1, keptRate: r(1, 2, 0.5) },
        { ...f, kept: 1, missed: 0, keptRate: r(1, 1, 1) },
      ],
      byStageType: [
        { type: 'hr_interview', kept: 1, missed: 1, keptRate: r(1, 2, 0.5) },
        { type: 'received', kept: 6, missed: 2, keptRate: r(6, 8, 0.75) },
      ],
    },
    outcomeCoverage: r(6, 8, 0.75),
  };
}

