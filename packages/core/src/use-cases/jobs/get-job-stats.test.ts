import { jobStatsDtoSchema, ROLES, STATS_WEEKS, type Job } from '@candydati/domain';
import { describe, expect, it } from 'vitest';
import { buildJob, completeJobContent, createInMemoryJobRepository, createTestJobDeps, fixedQualityReport, userActor } from '../../testing/index.js';
import { getJobStats } from './get-job-stats.js';

/** Wednesday: the current week opens on Monday 2026-06-01, the oldest shown on 2026-03-16. */
const NOW = new Date('2026-06-03T10:00:00.000Z');
const at = (iso: string) => new Date(iso);
const actor = userActor({ role: 'interviewer', organizationId: 'org_a' });

let seq = 0;
const job = (overrides: Partial<Job>): Job => {
  seq += 1;
  return buildJob({ id: `j${seq}`, slug: `s${seq}`, organizationId: 'org_a', createdAt: at('2026-05-27T09:00:00Z'), ...overrides });
};
const published = (overrides: Partial<Job> = {}) => job({ status: 'published', publishedAt: at('2026-06-02T09:00:00Z'), ...overrides });

const depsWith = (jobs: readonly Job[]) =>
  createTestJobDeps({ jobs: createInMemoryJobRepository(jobs), now: () => NOW, adQualityThreshold: 6 });

const fixture = (): readonly Job[] => [
  job({ status: 'draft', createdAt: at('2026-05-31T23:59:59.999Z') }), // Sunday: previous week
  job({ status: 'draft', createdAt: at('2026-06-01T00:00:00.000Z'), content: completeJobContent({ title: 'Partial', process: [] }) }),
  published({ quality: fixedQualityReport(4), content: completeJobContent({ title: 'Low' }) }),
  published({ quality: fixedQualityReport(8), content: completeJobContent({ title: 'High', role: 'frontend_developer' }) }),
  job({ status: 'closed', publishedAt: at('2026-05-25T08:00:00Z'), closedAt: at('2026-05-28T08:00:00Z') }),
  job({ status: 'draft', createdAt: at('2026-03-15T23:59:59Z') }), // before the window
  job({ organizationId: 'org_b', status: 'published', publishedAt: at('2026-06-02T09:00:00Z'), quality: fixedQualityReport(1) }),
  job({ organizationId: 'org_b', status: 'draft' }),
];

describe('getJobStats', () => {
  it('returns a DTO valid against the shared schema, stamped with deps.now()', async () => {
    const stats = await getJobStats(depsWith(fixture()), actor, {});
    expect(jobStatsDtoSchema.parse(stats)).toEqual(stats);
    expect(stats.generatedAt).toBe(NOW.toISOString());
  });

  it('counts per status for the actor organization only', async () => {
    const stats = await getJobStats(depsWith(fixture()), actor, {});
    expect(stats.statusCounts).toEqual({ draft: 3, published: 2, closed: 1, total: 6 });
  });

  it('buckets weeks from Monday 00:00 UTC, oldest first, closed ads counting as published', async () => {
    const { weekly } = await getJobStats(depsWith(fixture()), actor, {});
    expect(weekly).toHaveLength(STATS_WEEKS);
    expect(weekly[0]!.weekStart).toBe('2026-03-16');
    expect(weekly.at(-1)).toEqual({ weekStart: '2026-06-01', created: 1, published: 2 });
    expect(weekly.at(-2)).toEqual({ weekStart: '2026-05-25', created: 4, published: 1 });
    expect(weekly.slice(0, -2).every((w) => w.created === 0 && w.published === 0)).toBe(true);
  });

  it('reports quality, salary, process and readiness over the right ads', async () => {
    const stats = await getJobStats(depsWith(fixture()), actor, {});
    expect(stats.quality).toMatchObject({ threshold: 6, average: 6, belowCount: 1 });
    expect(stats.quality.items.map((i) => [i.title, i.belowThreshold])).toEqual([['Low', true], ['High', false]]);
    expect(stats.salary.items.map((i) => i.title)).toEqual(['Low', 'High']);
    expect(stats.salary.medians).toEqual([{ currency: 'EUR', period: 'year', count: 2, medianMin: 35000, medianMax: 45000 }]);
    expect(stats.process).toEqual({ jobCount: 2, averageStages: 2, averageProcessMinutes: 90, averageResponseDays: 5 });
    expect(stats.readiness).toEqual({ draftCount: 3, readyCount: 2, blockers: [{ rule: 'too_few_stages', path: 'process', drafts: 1 }] });
  });

  it('gives zeros, nulls, empty lists and zero weeks to an empty organization', async () => {
    const stats = await getJobStats(depsWith(fixture()), userActor({ organizationId: 'org_empty' }), {});
    expect(stats.statusCounts).toEqual({ draft: 0, published: 0, closed: 0, total: 0 });
    expect(stats.weekly).toHaveLength(STATS_WEEKS);
    expect(stats.weekly.every((w) => w.created === 0 && w.published === 0)).toBe(true);
    expect(stats.quality).toEqual({ threshold: 6, items: [], average: null, belowCount: 0 });
    expect(stats.salary).toEqual({ items: [], medians: [] });
    expect(stats.process).toEqual({ jobCount: 0, averageStages: null, averageProcessMinutes: null, averageResponseDays: null });
    expect(stats.readiness).toEqual({ draftCount: 0, readyCount: 0, blockers: [] });
  });

  it('never counts jobs of another organization', async () => {
    const stats = await getJobStats(depsWith(fixture()), userActor({ organizationId: 'org_b' }), {});
    expect(stats.statusCounts).toEqual({ draft: 1, published: 1, closed: 0, total: 2 });
    expect(stats.quality.items.map((i) => i.total)).toEqual([1]);
  });

  it('lets every role read and audits nothing', async () => {
    const deps = depsWith(fixture());
    for (const role of ROLES) {
      await expect(getJobStats(deps, userActor({ role, organizationId: 'org_a' }), {})).resolves.toBeDefined();
    }
    expect(deps.auditLog.events()).toHaveLength(0);
  });

  it('is guarded by job:read', () => {
    expect(getJobStats.meta).toEqual({ name: 'getJobStats', permission: 'job:read' });
  });
});
