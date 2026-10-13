import { describe, expect, it } from 'vitest';
import { ForbiddenError, NotFoundError, ValidationError } from '../../errors.js';
import { createDistributionRegistry, emptyDistributionRegistry } from '../../distribution-registry.js';
import {
  buildJob,
  createFakeDistributionChannel,
  createTestDistributionDeps,
  DISTRIBUTION_ORG,
  userActor,
  type TestDistributionDeps,
} from '../../testing/index.js';
import { getDistributionOverview, setChannelEnabled } from './channels.js';
import { getJobDistribution, syncJobDistribution } from './job-distribution.js';
import { runDistributionSync } from './run-distribution-sync.js';

const recruiter = userActor({ role: 'recruiter', organizationId: DISTRIBUTION_ORG });
const admin = userActor({ role: 'admin', organizationId: DISTRIBUTION_ORG });
const system = { type: 'system' as const, id: null, onBehalfOfUserId: null, organizationId: DISTRIBUTION_ORG, role: 'owner' as const };

const PUBLISHED = { organizationId: DISTRIBUTION_ORG, status: 'published' as const, publishedAt: new Date('2026-05-01T00:00:00Z') };

async function world(job = buildJob({ id: 'job_1', ...PUBLISHED }), options: Parameters<typeof createTestDistributionDeps>[0] = {}): Promise<TestDistributionDeps> {
  const deps = createTestDistributionDeps(options);
  await deps.jobs.create(job);
  return deps;
}

const sync = (deps: TestDistributionDeps, jobId = 'job_1', organizationId = DISTRIBUTION_ORG) => runDistributionSync(deps, system, { organizationId, jobId });

describe('createDistributionRegistry', () => {
  it('lists channels in order and finds them by id', () => {
    const [a, b] = [createFakeDistributionChannel('a-board'), createFakeDistributionChannel('b-board')];
    const registry = createDistributionRegistry([a, b]);
    expect(registry.list().map((channel) => channel.id)).toEqual(['a-board', 'b-board']);
    expect(registry.get('b-board')).toBe(b);
    expect(registry.get('nope')).toBeNull();
    expect(emptyDistributionRegistry.list()).toEqual([]);
  });

  it('refuses a duplicate, a malformed id and the reserved feed id', () => {
    expect(() => createDistributionRegistry([createFakeDistributionChannel('x'), createFakeDistributionChannel('x')])).toThrow(/twice/);
    expect(() => createDistributionRegistry([createFakeDistributionChannel('Bad Id')])).toThrow(/Invalid/);
    expect(() => createDistributionRegistry([createFakeDistributionChannel('feed')])).toThrow(/Invalid/);
  });
});

describe('runDistributionSync', () => {
  it('is a no-op that records nothing with the empty registry', async () => {
    const deps = await world(undefined, { channels: [] });
    expect(await sync(deps)).toEqual({ published: 0, removed: 0, failed: 0, skipped: null });
    expect(deps.distributions.snapshot()).toEqual([]);
    expect(deps.auditLog.events()).toEqual([]);
  });

  it('publishes a published job on every enabled channel and stores the answer', async () => {
    const deps = await world();
    expect(await sync(deps)).toEqual({ published: 1, removed: 0, failed: 0, skipped: null });
    expect(deps.channel.calls()).toEqual([{ kind: 'publish', jobId: 'job_1', slug: 'backend-developer-abc123' }]);
    expect(deps.distributions.snapshot()).toEqual([
      { organizationId: DISTRIBUTION_ORG, jobId: 'job_1', channelId: 'fake-board', status: 'published', externalId: 'ext-backend-developer-abc123', url: 'https://board.test/backend-developer-abc123', error: null, updatedAt: deps.now() },
    ]);
  });

  it('sends only the public face of the ad to the channel', async () => {
    let seen: unknown;
    const channel = { ...createFakeDistributionChannel(), publish: async (view: unknown) => ((seen = view), {}) };
    const deps = await world(undefined, { channels: [channel as never] });
    await sync(deps);
    expect(Object.keys(seen as object).toSorted()).toEqual(['content', 'id', 'publishedAt', 'slug', 'updatedAt', 'url']);
    expect(seen).toMatchObject({ url: 'https://jobs.example.com/careers/acme/backend-developer-abc123' });
  });

  it('updates a job already on the channel, then takes it down when it is closed', async () => {
    const deps = await world();
    await sync(deps);
    await sync(deps);
    expect(deps.channel.calls().map((call) => call.kind)).toEqual(['publish', 'update']);
    expect(deps.channel.calls()[1]).toMatchObject({ previous: { externalId: 'ext-backend-developer-abc123', url: 'https://board.test/backend-developer-abc123' } });
    const job = (await deps.jobs.findById(DISTRIBUTION_ORG, 'job_1'))!;
    await deps.jobs.transition(job.organizationId, job.id, job.status, { status: 'closed', closedAt: deps.now(), updatedAt: deps.now() });
    expect(await sync(deps)).toEqual({ published: 0, removed: 1, failed: 0, skipped: null });
    expect(deps.channel.calls().at(-1)).toMatchObject({ kind: 'remove', removal: { jobId: 'job_1', externalId: 'ext-backend-developer-abc123' } });
    expect(deps.distributions.snapshot()[0]).toMatchObject({ status: 'removed', error: null, externalId: 'ext-backend-developer-abc123' });
    expect(await sync(deps)).toMatchObject({ removed: 0 });
    expect(deps.channel.calls()).toHaveLength(3);
  });

  it('never sends a draft or a closed job that was never on the channel', async () => {
    for (const status of ['draft', 'closed'] as const) {
      const deps = await world(buildJob({ id: 'job_1', organizationId: DISTRIBUTION_ORG, status }));
      expect(await sync(deps)).toEqual({ published: 0, removed: 0, failed: 0, skipped: null });
      expect(deps.channel.calls()).toEqual([]);
      expect(deps.distributions.snapshot()).toEqual([]);
    }
  });

  it('records a failing channel as failed with a short reason, keeps the others going and succeeds on the retry', async () => {
    const [bad, good] = [createFakeDistributionChannel('bad-board'), createFakeDistributionChannel('good-board')];
    bad.fail('  503\nService  unavailable ' + 'x'.repeat(500));
    const deps = await world(undefined, { channels: [bad, good] });
    expect(await sync(deps)).toEqual({ published: 1, removed: 0, failed: 1, skipped: null });
    const rows = deps.distributions.snapshot();
    const failed = rows.find((row) => row.channelId === 'bad-board')!;
    expect(failed).toMatchObject({ status: 'failed', externalId: null });
    expect(failed.error!.startsWith('503 Service unavailable xxx')).toBe(true);
    expect(failed.error!.length).toBeLessThanOrEqual(300);
    expect(rows.find((row) => row.channelId === 'good-board')?.status).toBe('published');
    bad.succeed();
    expect(await sync(deps)).toEqual({ published: 2, removed: 0, failed: 0, skipped: null });
    expect(deps.distributions.snapshot().find((row) => row.channelId === 'bad-board')).toMatchObject({ status: 'published', error: null });
    expect(bad.calls().map((call) => call.kind)).toEqual(['publish', 'publish']);
  });

  it('records a failed removal and a non-Error failure', async () => {
    const deps = await world();
    await sync(deps);
    const job = (await deps.jobs.findById(DISTRIBUTION_ORG, 'job_1'))!;
    await deps.jobs.transition(job.organizationId, job.id, job.status, { status: 'closed', closedAt: deps.now(), updatedAt: deps.now() });
    deps.channel.fail('board down');
    expect(await sync(deps)).toMatchObject({ failed: 1 });
    expect(deps.distributions.snapshot()[0]).toMatchObject({ status: 'failed', error: 'board down', externalId: 'ext-backend-developer-abc123' });
    const throwing = { ...createFakeDistributionChannel('odd'), publish: async () => Promise.reject('plain') };
    const other = await world(undefined, { channels: [throwing as never] });
    await sync(other);
    expect(other.distributions.snapshot()[0]?.error).toBe('plain');
    const empty = { ...createFakeDistributionChannel('empty'), publish: async () => Promise.reject(new Error('')) };
    const third = await world(undefined, { channels: [empty as never] });
    await sync(third);
    expect(third.distributions.snapshot()[0]?.error).toBe('channel_error');
  });

  it('does not call a channel the organization switched off, and takes the ad down from it', async () => {
    const deps = await world();
    await deps.distributionSettings.save({ organizationId: DISTRIBUTION_ORG, channelId: 'fake-board', enabled: false, updatedAt: deps.now() });
    expect(await sync(deps)).toMatchObject({ published: 0, removed: 0 });
    expect(deps.channel.calls()).toEqual([]);
    await deps.distributionSettings.save({ organizationId: DISTRIBUTION_ORG, channelId: 'fake-board', enabled: true, updatedAt: deps.now() });
    await sync(deps);
    await deps.distributionSettings.save({ organizationId: DISTRIBUTION_ORG, channelId: 'fake-board', enabled: false, updatedAt: deps.now() });
    expect(await sync(deps)).toMatchObject({ removed: 1 });
    expect(deps.distributions.snapshot()[0]?.status).toBe('removed');
  });

  it('marks a publication that never reached the channel as removed without calling it', async () => {
    const deps = await world();
    deps.channel.fail('down');
    await sync(deps);
    const job = (await deps.jobs.findById(DISTRIBUTION_ORG, 'job_1'))!;
    await deps.jobs.transition(job.organizationId, job.id, job.status, { status: 'closed', closedAt: deps.now(), updatedAt: deps.now() });
    deps.channel.succeed();
    expect(await sync(deps)).toMatchObject({ removed: 1, failed: 0 });
    expect(deps.channel.calls().map((call) => call.kind)).toEqual(['publish']);
    expect(deps.distributions.snapshot()[0]?.status).toBe('removed');
  });

  it('skips a missing job and a job of another organization', async () => {
    const deps = await world();
    expect(await sync(deps, 'nope')).toMatchObject({ skipped: 'job_not_found' });
    expect(await runDistributionSync(deps, { ...system, organizationId: 'org_b' }, { organizationId: 'org_b', jobId: 'job_1' })).toMatchObject({ skipped: 'job_not_found' });
    expect(deps.channel.calls()).toEqual([]);
  });

  it('skips when the organization is gone and refuses an input for another organization than the actor', async () => {
    const deps = await world(buildJob({ id: 'job_1', ...PUBLISHED, organizationId: 'org_x' }));
    const inOrgX = { ...system, organizationId: 'org_x' };
    expect(await runDistributionSync(deps, inOrgX, { organizationId: 'org_x', jobId: 'job_1' })).toEqual({ published: 0, removed: 0, failed: 0, skipped: 'organization_not_found' });
    await expect(runDistributionSync(deps, system, { organizationId: 'org_x', jobId: 'job_1' })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(runDistributionSync(deps, system, { organizationId: '' })).rejects.toBeInstanceOf(ValidationError);
  });
});

describe('getJobDistribution', () => {
  it('lists the feed row first: published, closed and draft', async () => {
    const deps = await world(undefined, { channels: [] });
    expect(await getJobDistribution(deps, recruiter, { jobId: 'job_1' })).toEqual([
      { channelId: 'feed', label: 'Feed XML', status: 'published', url: 'https://jobs.example.com/careers/acme/jobs.xml', error: null, updatedAt: '2026-01-01T00:00:00.000Z' },
    ]);
    const closed = await world(buildJob({ id: 'job_1', organizationId: DISTRIBUTION_ORG, status: 'closed', closedAt: new Date('2026-05-02T00:00:00Z') }), { channels: [] });
    expect(await getJobDistribution(closed, recruiter, { jobId: 'job_1' })).toEqual([
      { channelId: 'feed', label: 'Feed XML', status: 'removed', url: null, error: null, updatedAt: '2026-05-02T00:00:00.000Z' },
    ]);
    const draft = await world(buildJob({ id: 'job_1', organizationId: DISTRIBUTION_ORG }), { channels: [] });
    expect(await getJobDistribution(draft, recruiter, { jobId: 'job_1' })).toEqual([
      { channelId: 'feed', label: 'Feed XML', status: 'pending', url: null, error: null, updatedAt: null },
    ]);
  });

  it('shows a registered channel as pending before its first sync, then with its answer', async () => {
    const deps = await world();
    expect((await getJobDistribution(deps, recruiter, { jobId: 'job_1' })).map((row) => [row.channelId, row.status, row.url])).toEqual([
      ['feed', 'published', 'https://jobs.example.com/careers/acme/jobs.xml'],
      ['fake-board', 'pending', null],
    ]);
    await sync(deps);
    expect((await getJobDistribution(deps, recruiter, { jobId: 'job_1' }))[1]).toEqual({
      channelId: 'fake-board', label: 'Fake board', status: 'published', url: 'https://board.test/backend-developer-abc123', error: null, updatedAt: deps.now().toISOString(),
    });
  });

  it('leaves out a switched-off channel with no history, and every channel of a draft', async () => {
    const deps = await world();
    await deps.distributionSettings.save({ organizationId: DISTRIBUTION_ORG, channelId: 'fake-board', enabled: false, updatedAt: deps.now() });
    expect((await getJobDistribution(deps, recruiter, { jobId: 'job_1' })).map((row) => row.channelId)).toEqual(['feed']);
    const draft = await world(buildJob({ id: 'job_1', organizationId: DISTRIBUTION_ORG }));
    expect((await getJobDistribution(draft, recruiter, { jobId: 'job_1' })).map((row) => row.channelId)).toEqual(['feed']);
  });

  it('is open to every role that reads jobs, hides other organizations and unknown jobs', async () => {
    const deps = await world();
    await expect(getJobDistribution(deps, userActor({ role: 'interviewer', organizationId: DISTRIBUTION_ORG }), { jobId: 'job_1' })).resolves.toHaveLength(2);
    await expect(getJobDistribution(deps, userActor({ organizationId: 'org_b' }), { jobId: 'job_1' })).rejects.toBeInstanceOf(NotFoundError);
    await expect(getJobDistribution(deps, recruiter, { jobId: 'nope' })).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('syncJobDistribution', () => {
  it('re-sends now, returns the new statuses and audits', async () => {
    const deps = await world();
    const result = await syncJobDistribution(deps, recruiter, { jobId: 'job_1' });
    expect(result.summary).toEqual({ published: 1, removed: 0, failed: 0 });
    expect(result.distribution.map((row) => [row.channelId, row.status])).toEqual([['feed', 'published'], ['fake-board', 'published']]);
    expect(deps.auditLog.events()[0]).toMatchObject({ action: 'job.distribution_synced', target: { type: 'job', id: 'job_1' }, metadata: { published: 1, removed: 0, failed: 0 } });
  });

  it('shows a failing channel as failed instead of throwing', async () => {
    const deps = await world();
    deps.channel.fail('quota exceeded');
    const result = await syncJobDistribution(deps, recruiter, { jobId: 'job_1' });
    expect(result.summary.failed).toBe(1);
    expect(result.distribution[1]).toMatchObject({ status: 'failed', error: 'quota exceeded' });
  });

  it.each([
    ['hiring_manager', false],
    ['interviewer', false],
    ['recruiter', true],
    ['admin', true],
    ['owner', true],
  ] as const)('permission job:publish for %s: %s', async (role, allowed) => {
    const deps = await world();
    const call = syncJobDistribution(deps, userActor({ role, organizationId: DISTRIBUTION_ORG }), { jobId: 'job_1' });
    if (allowed) await expect(call).resolves.toBeDefined();
    else await expect(call).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('cannot touch the job of another organization', async () => {
    const deps = await world();
    await expect(syncJobDistribution(deps, userActor({ organizationId: 'org_b' }), { jobId: 'job_1' })).rejects.toBeInstanceOf(NotFoundError);
    expect(deps.channel.calls()).toEqual([]);
  });
});

describe('getDistributionOverview', () => {
  it('gives the feed URLs and the channels with their switch', async () => {
    const deps = await world();
    await deps.distributionSettings.save({ organizationId: DISTRIBUTION_ORG, channelId: 'fake-board', enabled: false, updatedAt: deps.now() });
    expect(await getDistributionOverview(deps, recruiter, {})).toEqual({
      feedUrl: 'https://jobs.example.com/careers/acme/jobs.xml',
      llmsTxtUrl: 'https://jobs.example.com/careers/acme/llms.txt',
      channels: [
        { channelId: 'feed', label: 'Feed XML', builtIn: true, enabled: true },
        { channelId: 'fake-board', label: 'Fake board', builtIn: false, enabled: false },
      ],
    });
  });

  it('lists only the feed with the empty registry, and channels default to on', async () => {
    const empty = await world(undefined, { channels: [] });
    expect((await getDistributionOverview(empty, recruiter, {})).channels.map((channel) => channel.channelId)).toEqual(['feed']);
    const deps = await world();
    expect((await getDistributionOverview(deps, recruiter, {})).channels[1]?.enabled).toBe(true);
  });
});

describe('setChannelEnabled', () => {
  it('stores the switch for the organization only and audits it', async () => {
    const deps = await world();
    expect(await setChannelEnabled(deps, admin, { channelId: 'fake-board', enabled: false })).toEqual({ channelId: 'fake-board', label: 'Fake board', builtIn: false, enabled: false });
    expect(deps.distributionSettings.snapshot()).toEqual([{ organizationId: DISTRIBUTION_ORG, channelId: 'fake-board', enabled: false, updatedAt: deps.now() }]);
    await setChannelEnabled(deps, admin, { channelId: 'fake-board', enabled: true });
    expect(deps.distributionSettings.snapshot()).toHaveLength(1);
    expect(deps.auditLog.events()[0]).toMatchObject({ action: 'distribution.channel_updated', target: { type: 'distribution_channel', id: 'fake-board' }, metadata: { enabled: false } });
  });

  it('refuses the feed, an unknown channel and a non boolean', async () => {
    const deps = await world();
    await expect(setChannelEnabled(deps, admin, { channelId: 'feed', enabled: false })).rejects.toMatchObject({ issues: [{ path: 'channelId', message: 'feed_cannot_be_switched' }] });
    await expect(setChannelEnabled(deps, admin, { channelId: 'nope', enabled: false })).rejects.toBeInstanceOf(NotFoundError);
    await expect(setChannelEnabled(deps, admin, { channelId: 'fake-board', enabled: 'no' })).rejects.toBeInstanceOf(ValidationError);
  });

  it.each([
    ['owner', true],
    ['admin', true],
    ['recruiter', false],
    ['hiring_manager', false],
    ['interviewer', false],
  ] as const)('permission organization:update for %s: %s', async (role, allowed) => {
    const deps = await world();
    const call = setChannelEnabled(deps, userActor({ role, organizationId: DISTRIBUTION_ORG }), { channelId: 'fake-board', enabled: false });
    if (allowed) await expect(call).resolves.toBeDefined();
    else await expect(call).rejects.toBeInstanceOf(ForbiddenError);
  });
});
