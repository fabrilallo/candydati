import { describe, expect, it } from 'vitest';
import { ForbiddenError, NotFoundError, ValidationError } from '../../errors.js';
import {
  apiKeyActor,
  seedCandidateWorld,
  userActor,
  ORG_A,
  ORG_B,
} from '../../testing/index.js';
import { seedRandomEvents } from '../../testing/report-random.js';
import { expectedJobFunnels, expectedReports, REPORT_FROM, REPORT_NOW, REPORT_TO, seedReportDataset } from '../../testing/report-dataset.js';
import { reportsToCsv } from './csv.js';
import { exportReportsCsv } from './export-reports-csv.js';
import { getReports } from './get-reports.js';

const world = () => seedCandidateWorld({ applications: [], candidates: [], extractions: [], jobs: [], overrides: { now: () => REPORT_NOW } });
const owner = userActor({ role: 'owner', organizationId: ORG_A });
const query = { from: REPORT_FROM, to: REPORT_TO };

async function seeded() {
  const deps = world();
  const ids = await seedReportDataset(deps, ORG_A, 'a');
  return { deps, ids };
}

describe('getReports on the seeded dataset (in memory)', () => {
  it('computes every number exactly', async () => {
    const { deps, ids } = await seeded();
    expect(await getReports(deps, owner, query)).toEqual(expectedReports(ids));
  });

  it('narrows every figure to one job', async () => {
    const { deps, ids } = await seeded();
    const report = await getReports(deps, owner, { ...query, jobId: ids.backend });
    const b = { jobId: ids.backend, title: 'Backend Developer' };
    expect(report.jobId).toBe(ids.backend);
    expect(report.timeToHire).toEqual({ overall: { count: 3, median: 15, p75: 17.5 }, byJob: [{ ...b, count: 3, median: 15, p75: 17.5 }] });
    expect(report.timeToFill.items.map((i) => [i.jobId, i.days])).toEqual([[ids.backend, 64.42]]);
    expect(report.funnel.stages).toEqual(expectedJobFunnels().backend);
    expect(report.funnel.outcomes).toEqual({ hired: 3, not_selected: 1, withdrawn: 1 });
    expect(report.sources).toEqual([
      { origin: 'linkedin', applications: 3, hires: 2 },
      { origin: 'direct', applications: 1, hires: 0 },
      { origin: 'google.com', applications: 1, hires: 0 },
      { origin: 'referral', applications: 0, hires: 1 },
    ]);
    expect(report.responses).toMatchObject({ kept: 5, missed: 2, closed: { count: 5, total: 7, rate: 0.7143 }, responseHours: { count: 6, median: 48, p75: 48 }, open: 1, overdue: 1 });
    expect(report.outcomeCoverage).toEqual({ count: 4, total: 5, rate: 0.8 });
  });

  it('gives the funnel of every job in its declared order, with cohort conversions', async () => {
    const { deps, ids } = await seeded();
    const expected = expectedJobFunnels();
    for (const key of ['backend', 'frontend', 'closed'] as const) {
      expect((await getReports(deps, owner, { ...query, jobId: ids[key] })).funnel.stages).toEqual(expected[key]);
    }
  });

  it('is empty, with null rates and no division by zero, outside the data', async () => {
    const { deps } = await seeded();
    const report = await getReports(deps, owner, { from: new Date('2025-01-01T00:00:00Z'), to: new Date('2025-01-31T00:00:00Z') });
    expect(report.timeToHire.overall).toEqual({ count: 0, median: null, p75: null });
    expect(report.funnel.stages.every((s) => s.entered === 0)).toBe(true);
    expect(report.responses.closed).toEqual({ count: 0, total: 0, rate: null });
    expect(report.outcomeCoverage).toEqual({ count: 0, total: 0, rate: null });
    expect(report.sources).toEqual([]);
  });

  it('includes both ends of the period', async () => {
    const { deps } = await seeded();
    const exact = await getReports(deps, owner, { from: new Date('2026-06-12T10:00:00Z'), to: new Date('2026-06-12T10:00:00Z') });
    expect(exact.timeToHire.overall.count).toBe(1);
  });

  it('refuses an unknown job and a job of another organization', async () => {
    const { deps, ids } = await seeded();
    await expect(getReports(deps, owner, { ...query, jobId: 'nope' })).rejects.toBeInstanceOf(NotFoundError);
    await expect(getReports(deps, userActor({ role: 'owner', organizationId: ORG_B }), { ...query, jobId: ids.backend })).rejects.toBeInstanceOf(NotFoundError);
  });

  it('refuses an inverted or too long period', async () => {
    const { deps } = await seeded();
    await expect(getReports(deps, owner, { from: REPORT_TO, to: REPORT_FROM })).rejects.toBeInstanceOf(ValidationError);
    await expect(getReports(deps, owner, { from: new Date('2020-01-01T00:00:00Z'), to: REPORT_TO })).rejects.toBeInstanceOf(ValidationError);
    await expect(getReports(deps, owner, { from: 'garbage', to: REPORT_TO })).rejects.toBeInstanceOf(ValidationError);
  });

  it('never mixes organizations: another organization sees only its own numbers', async () => {
    const { deps, ids } = await seeded();
    const otherIds = await seedReportDataset(deps, ORG_B, 'b');
    deps.store.write({ applications: deps.store.read().applications.map((a) => (a.organizationId === ORG_B && a.id === 'b-a6' ? { ...a, origin: 'only-in-b' } : a)) });
    expect(await getReports(deps, owner, query)).toEqual(expectedReports(ids));
    const other = await getReports(deps, userActor({ role: 'owner', organizationId: ORG_B }), query);
    expect(other).toEqual({ ...expectedReports(otherIds), sources: expect.any(Array) });
    expect(other.sources.map((s) => s.origin)).toContain('only-in-b');
    expect(JSON.stringify(await getReports(deps, owner, query))).not.toContain('only-in-b');
  });
});

describe('funnel property: no rate above 100%', () => {
  const rates = (report: Awaited<ReturnType<typeof getReports>>) => report.funnel.stages.flatMap((s) => (s.conversionToNext ? [s.conversionToNext] : []));

  it.each([1, 2, 3, 4, 5, 6, 7, 8])('holds for random event sequences (seed %i), with and without a job filter', async (seed) => {
    const deps = world();
    const jobIds = await seedRandomEvents(deps, ORG_A, `s${seed}`, seed, 40);
    const wide = { from: new Date('2026-06-01T00:00:00Z'), to: new Date('2026-06-30T23:59:59Z') };
    for (const filter of [{}, ...jobIds.map((jobId) => ({ jobId }))]) {
      const report = await getReports(deps, owner, { ...wide, ...filter });
      for (const value of rates(report)) {
        expect(value.count).toBeLessThanOrEqual(value.total);
        expect(value.rate === null || value.rate <= 1).toBe(true);
      }
      expect(rates(report).length).toBe(report.funnel.stages.length);
    }
  });
});

describe('getReports permissions', () => {
  it.each(['owner', 'admin', 'recruiter', 'hiring_manager'] as const)('lets %s read', async (role) => {
    const { deps } = await seeded();
    await expect(getReports(deps, userActor({ role, organizationId: ORG_A }), query)).resolves.toMatchObject({ minSample: 5 });
  });

  it('refuses an interviewer', async () => {
    const { deps } = await seeded();
    await expect(getReports(deps, userActor({ role: 'interviewer', organizationId: ORG_A }), query)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('lets an API key with the scope read, and refuses one without it', async () => {
    const { deps } = await seeded();
    await expect(getReports(deps, apiKeyActor({ role: 'recruiter', organizationId: ORG_A, scopes: ['report:read'] }), query)).resolves.toBeDefined();
    await expect(getReports(deps, apiKeyActor({ role: 'recruiter', organizationId: ORG_A, scopes: ['job:read'] }), query)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('writes nothing to the audit log', async () => {
    const { deps } = await seeded();
    await getReports(deps, owner, query);
    expect(deps.auditLog.events()).toEqual([]);
  });
});

describe('exportReportsCsv', () => {
  it('writes every section with the denominators, in one file', async () => {
    const { deps, ids } = await seeded();
    const file = await exportReportsCsv(deps, owner, query);
    expect(file.fileName).toBe('reports-2026-06-01_2026-06-30.csv');
    expect(file.csv).toContain('# time_to_hire_days\njob_id,job,count,median,p75\nall,all,5,10,15');
    expect(file.csv).toContain(`${ids.backend},Backend Developer,3,15,17.5`);
    expect(file.csv).toContain('# funnel\nposition,stage_type,entered,advanced,base,conversion_rate\n,received,9,5,9,0.5556');
    expect(file.csv).toContain('# outcome_coverage\nwith_outcome,applications,rate\n6,8,0.75');
    expect(file.csv).toContain('referral,0,1');
    expect(file.csv.endsWith('\n')).toBe(true);
  });

  it('is permission checked', async () => {
    const { deps } = await seeded();
    await expect(exportReportsCsv(deps, userActor({ role: 'interviewer', organizationId: ORG_A }), query)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('quotes cells and defuses spreadsheet formulas', async () => {
    const { deps, ids } = await seeded();
    const report = await getReports(deps, owner, query);
    const csv = reportsToCsv({ ...report, timeToHire: { ...report.timeToHire, byJob: [{ jobId: ids.backend, title: '=HYPERLINK("x"),"y"', count: 1, median: 1, p75: 1 }] } });
    expect(csv).toContain(`${ids.backend},"'=HYPERLINK(""x""),""y""",1,1,1`);
  });
});
