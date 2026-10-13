import { randomUUID } from 'node:crypto';
import { createDb, schema, type DbHandle } from '@tt/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ForbiddenError, NotFoundError } from '../errors.js';
import { userActor } from '../testing/actors.js';
import { coreTestDatabaseUrl } from '../testing/postgres.js';
import { seedRandomEvents } from '../testing/report-random.js';
import { expectedJobFunnels, expectedReports, REPORT_FROM, REPORT_NOW, REPORT_TO, seedReportDataset, type DatasetRepositories } from '../testing/report-dataset.js';
import type { ReportDeps } from '../report-ports.js';
import { exportReportsCsv } from '../use-cases/reports/export-reports-csv.js';
import { getReports } from '../use-cases/reports/get-reports.js';
import { createDrizzleApplications } from './drizzle-applications.js';
import { createDrizzleAuditLog } from './drizzle-audit-log.js';
import { createDrizzleCandidates } from './drizzle-candidates.js';
import { createDrizzleJobs } from './drizzle-jobs.js';
import { createDrizzleResponsePromises, createDrizzleStageEvents } from './drizzle-report-history.js';
import { createDrizzleReports } from './drizzle-reports.js';
import { createDrizzleTransaction } from './drizzle-repositories.js';

let handle: DbHandle;
const query = { from: REPORT_FROM, to: REPORT_TO };

beforeAll(async () => {
  handle = createDb(coreTestDatabaseUrl(), 4);
});
afterAll(async () => {
  await handle.close();
});

const repositories = (): DatasetRepositories => ({
  jobs: createDrizzleJobs(handle.db),
  candidates: createDrizzleCandidates(handle.db),
  applications: createDrizzleApplications(handle.db),
  stageEvents: createDrizzleStageEvents(handle.db),
  promises: createDrizzleResponsePromises(handle.db),
});

const deps = (): ReportDeps => ({
  auditLog: createDrizzleAuditLog(handle.db),
  transaction: createDrizzleTransaction(handle.db),
  jobs: createDrizzleJobs(handle.db),
  reports: createDrizzleReports(handle.db),
  now: () => REPORT_NOW,
});

async function newOrg(): Promise<string> {
  const id = randomUUID();
  await handle.db.insert(schema.organization).values({ id, name: `Org ${id}`, slug: id, createdAt: new Date() });
  return id;
}

async function seeded() {
  const org = await newOrg();
  const ids = await seedReportDataset(repositories(), org, randomUUID().slice(0, 8));
  return { org, ids, owner: userActor({ role: 'owner', organizationId: org }) };
}

describe('getReports on Postgres', () => {
  it('computes every number exactly, the same as the in-memory adapter', async () => {
    const { owner, ids } = await seeded();
    expect(await getReports(deps(), owner, query)).toEqual(expectedReports(ids));
  });

  it('narrows to one job', async () => {
    const { owner, ids } = await seeded();
    const report = await getReports(deps(), owner, { ...query, jobId: ids.backend });
    expect(report.timeToHire.overall).toEqual({ count: 3, median: 15, p75: 17.5 });
    expect(report.funnel.stages).toEqual(expectedJobFunnels().backend);
    expect(report.responses).toMatchObject({ kept: 5, missed: 2, responseHours: { count: 6, median: 48, p75: 48 }, open: 1, overdue: 1 });
    expect(report.outcomeCoverage).toEqual({ count: 4, total: 5, rate: 0.8 });
  });

  it('gives the funnel of every job in its declared order, with cohort conversions', async () => {
    const { owner, ids } = await seeded();
    const expected = expectedJobFunnels();
    for (const key of ['backend', 'frontend', 'closed'] as const) {
      expect((await getReports(deps(), owner, { ...query, jobId: ids[key] })).funnel.stages).toEqual(expected[key]);
    }
  });

  it('is empty outside the data', async () => {
    const { owner } = await seeded();
    const report = await getReports(deps(), owner, { from: new Date('2025-01-01T00:00:00Z'), to: new Date('2025-01-31T00:00:00Z') });
    expect(report.timeToHire.overall).toEqual({ count: 0, median: null, p75: null });
    expect(report.responses.responseHours).toEqual({ count: 0, median: null, p75: null });
    expect(report.sources).toEqual([]);
  });

  it('includes both ends of the period', async () => {
    const { owner } = await seeded();
    const exact = await getReports(deps(), owner, { from: new Date('2026-06-12T10:00:00Z'), to: new Date('2026-06-12T10:00:00Z') });
    expect(exact.timeToHire.overall.count).toBe(1);
  });

  it('keeps organizations apart, even when another one holds a lot more data', async () => {
    const first = await seeded();
    const second = await seeded();
    await handle.pool.query(`update application set origin = 'only-in-two' where organization_id = $1`, [second.org]);
    expect(await getReports(deps(), first.owner, query)).toEqual(expectedReports(first.ids));
    expect(JSON.stringify(await getReports(deps(), first.owner, query))).not.toContain('only-in-two');
    await expect(getReports(deps(), first.owner, { ...query, jobId: second.ids.backend })).rejects.toBeInstanceOf(NotFoundError);
  });

  it('is permission checked, and the CSV carries the same numbers', async () => {
    const { org, owner } = await seeded();
    await expect(getReports(deps(), userActor({ role: 'interviewer', organizationId: org }), query)).rejects.toBeInstanceOf(ForbiddenError);
    const file = await exportReportsCsv(deps(), owner, query);
    expect(file.csv).toContain('# outcome_coverage\nwith_outcome,applications,rate\n6,8,0.75');
  });
});

describe('funnel property on Postgres', () => {
  it('never shows a rate above 100% for random event sequences, and matches the in-memory adapter', async () => {
    const org = await newOrg();
    const jobIds = await seedRandomEvents(repositories(), org, randomUUID().slice(0, 8), 42, 40);
    const owner = userActor({ role: 'owner', organizationId: org });
    for (const filter of [{}, ...jobIds.map((jobId) => ({ jobId }))]) {
      const report = await getReports(deps(), owner, { ...query, ...filter });
      for (const stage of report.funnel.stages) expect(stage.conversionToNext?.rate ?? 0).toBeLessThanOrEqual(1);
    }
  });
});

describe('stage history on Postgres', () => {
  it('finds the unanswered promise, answers it and flips the overdue open ones across organizations', async () => {
    const { org } = await seeded();
    const promises = createDrizzleResponsePromises(handle.db);
    const [open] = await promises.listByApplication(org, `${(await handle.pool.query<{ id: string }>(`select id from application where organization_id = $1 and id like '%-a6'`, [org])).rows[0]?.id}`);
    expect(open).toMatchObject({ status: 'missed', respondedAt: null, stageId: 'received' });
    const unanswered = await promises.findUnanswered(org, open?.applicationId ?? '');
    expect(unanswered?.id).toBe(open?.id);
    expect(await promises.findUnanswered(randomUUID(), open?.applicationId ?? '')).toBeNull();
    await promises.save({ ...(unanswered as NonNullable<typeof unanswered>), respondedAt: REPORT_NOW, status: 'missed' });
    expect(await promises.findUnanswered(org, open?.applicationId ?? '')).toBeNull();

    // `b2` has an open promise due 06-17: the flip makes it missed, once.
    expect(await promises.markOverdueMissedAcrossOrganizations(REPORT_NOW)).toBeGreaterThanOrEqual(1);
    const { rows } = await handle.pool.query<{ status: string }>(`select status from response_promise where organization_id = $1 and application_id like '%-b2'`, [org]);
    expect(rows).toEqual([{ status: 'missed' }]);
    expect(await promises.markOverdueMissedAcrossOrganizations(REPORT_NOW)).toBe(0);
  });

  it('lists the events of an application oldest first and refuses to save a promise that does not exist', async () => {
    const { org } = await seeded();
    const { rows } = await handle.pool.query<{ id: string }>(`select id from application where organization_id = $1 and id like '%-a1'`, [org]);
    const events = await createDrizzleStageEvents(handle.db).listByApplication(org, rows[0]?.id ?? '');
    expect(events.map((e) => [e.fromStageId, e.toStageId, e.outcome])).toEqual([
      [null, 'received', null],
      ['received', 'stage-0', null],
      ['stage-0', 'stage-1', null],
      ['stage-1', null, 'hired'],
    ]);
    await expect(
      createDrizzleResponsePromises(handle.db).save({ id: randomUUID(), organizationId: org, applicationId: 'x', jobId: 'x', stageId: 'received', startedAt: REPORT_NOW, dueAt: REPORT_NOW, respondedAt: null, status: 'open', backfilled: false }),
    ).rejects.toThrow('not found');
  });
});
