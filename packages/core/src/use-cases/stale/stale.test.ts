import { describe, expect, it } from 'vitest';
import { ForbiddenError } from '../../errors.js';
import { apiKeyActor, buildApplication, buildCandidate, buildJob, completeJobContent, ORG_A, ORG_B, seedHrWorld, userActor, type TestHrDeps } from '../../testing/index.js';
import { markDigestsEmailed } from '../automations/scan-deadlines.js';
import { scanStaleJobs } from './scan-stale-jobs.js';
import { listStaleJobs } from './stale-jobs.js';

const DAY = 86_400_000;
const NOW = new Date('2026-06-01T10:00:00.000Z');
const ago = (days: number) => new Date(NOW.getTime() - days * DAY);
const hm = userActor({ id: 'hm_1', role: 'hiring_manager', organizationId: ORG_A });

const published = (id: string, days: number, overrides = {}) =>
  buildJob({ id, slug: id, organizationId: ORG_A, status: 'published', publishedAt: ago(days), updatedAt: ago(days), createdBy: 'recruiter_1', content: completeJobContent({ title: `Job ${id}` }), ...overrides });
const world = (jobs = [published('stale', 120)], applications = [] as ReturnType<typeof buildApplication>[]): TestHrDeps =>
  seedHrWorld({ jobs, applications, candidates: [buildCandidate({ organizationId: ORG_A })], overrides: { now: () => NOW } });

describe('listStaleJobs', () => {
  it('lists published jobs idle for 90 days, longest idle first, with days idle', async () => {
    const deps = world([published('a', 100), published('b', 200), published('fresh', 89), published('edge', 90)]);
    const list = await listStaleJobs(deps, hm, {});
    expect(list.map((s) => [s.job.id, s.daysIdle])).toEqual([['b', 200], ['a', 100], ['edge', 90]]);
  });

  it('ignores drafts and closed jobs', async () => {
    const deps = world([published('d', 200, { status: 'draft', publishedAt: null }), published('c', 200, { status: 'closed', closedAt: ago(100) })]);
    expect(await listStaleJobs(deps, hm, {})).toEqual([]);
  });

  it('counts a content update, a new application, a move or a decision as activity', async () => {
    const edited = published('edited', 200, { updatedAt: ago(10) });
    const received = published('received', 200);
    const moved = published('moved', 200);
    const decided = published('decided', 200);
    const idle = published('idle', 200);
    const app = (id: string, jobId: string, overrides = {}) => buildApplication({ id, jobId, organizationId: ORG_A, candidateId: id, createdAt: ago(200), stageChangedAt: ago(200), ...overrides });
    const candidates = ['received', 'moved', 'decided', 'idle'].map((id) => buildCandidate({ id, organizationId: ORG_A, email: `${id}@x.example` }));
    const deps = seedHrWorld({
      jobs: [edited, received, moved, decided, idle],
      candidates,
      applications: [
        app('received', 'received', { createdAt: ago(5), stageChangedAt: ago(5) }),
        app('moved', 'moved', { stageChangedAt: ago(7) }),
        app('decided', 'decided', { outcome: 'not_selected', closedAt: ago(3) }),
        app('idle', 'idle'),
      ],
      overrides: { now: () => NOW },
    });
    expect((await listStaleJobs(deps, hm, {})).map((s) => s.job.id)).toEqual(['idle']);
  });

  it('is isolated per organization and open to anyone who reads jobs, but not to outsiders', async () => {
    const deps = world();
    expect(await listStaleJobs(deps, userActor({ role: 'owner', organizationId: ORG_B }), {})).toEqual([]);
    expect(await listStaleJobs(deps, userActor({ role: 'interviewer', organizationId: ORG_A }), {})).toHaveLength(1);
    await expect(listStaleJobs(deps, apiKeyActor({ organizationId: ORG_A, scopes: ['candidate:read'] }), {})).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe('scanStaleJobs', () => {
  it('notifies the job owner once, with ids and counts only, and returns a digest', async () => {
    const deps = world();
    const { digests } = await scanStaleJobs(deps, { now: NOW });
    expect(deps.notifications.snapshot()).toHaveLength(1);
    expect(deps.notifications.snapshot()[0]).toMatchObject({ userId: 'recruiter_1', kind: 'job_stale', jobId: 'stale', applicationId: null, payload: { daysIdle: 120, lastActivityAt: ago(120).toISOString() } });
    expect(digests).toEqual([expect.objectContaining({ userId: 'recruiter_1', email: 'rita@acme.example', jobTitles: { stale: 'Job stale' } })]);
  });

  it('never repeats itself within the same staleness period', async () => {
    const deps = world();
    const first = await scanStaleJobs(deps, { now: NOW });
    await markDigestsEmailed(deps.notifications, first.digests, NOW);
    const again = await scanStaleJobs(deps, { now: new Date(NOW.getTime() + 3_600_000) });
    const muchLater = await scanStaleJobs(deps, { now: new Date(NOW.getTime() + 30 * DAY) });
    expect(deps.notifications.snapshot()).toHaveLength(1);
    expect(again.digests).toEqual([]);
    expect(muchLater.digests).toEqual([]);
  });

  it('notifies again after fresh activity followed by another 90 quiet days', async () => {
    const deps = world();
    await scanStaleJobs(deps, { now: NOW });
    const job = await deps.jobs.findById(ORG_A, 'stale');
    await deps.jobs.updateContent(ORG_A, 'stale', job!.status, { content: job!.content, updatedAt: new Date(NOW.getTime() + 10 * DAY) });
    expect((await scanStaleJobs(deps, { now: new Date(NOW.getTime() + 50 * DAY) })).digests).toEqual([]);
    const second = await scanStaleJobs(deps, { now: new Date(NOW.getTime() + 100 * DAY) });
    expect(second.digests).toHaveLength(1);
    expect(deps.notifications.snapshot()).toHaveLength(2);
  });

  it('falls back to owners and admins when the owner left, across organizations, and closes nothing', async () => {
    const orphan = published('orphan', 120, { createdBy: 'gone' });
    const deps = world([orphan]);
    await scanStaleJobs(deps, { now: NOW });
    expect(deps.notifications.snapshot().map((n) => n.userId).sort()).toEqual(['admin_1', 'user_test']);
    expect((await deps.jobs.findById(ORG_A, 'orphan'))?.status).toBe('published');
  });

  it('does nothing when no job is stale', async () => {
    const deps = world([published('fresh', 10)]);
    expect(await scanStaleJobs(deps, { now: NOW })).toEqual({ digests: [] });
    expect(deps.notifications.snapshot()).toEqual([]);
  });
});
