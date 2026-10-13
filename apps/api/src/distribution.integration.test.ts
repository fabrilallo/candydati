import { completeJobContent, createFakeDistributionChannel, type FakeDistributionChannel } from '@tt/core/testing';
import { buildJobsFeedXml, childText, childrenNamed, parseXml, type DistributionChannelDto, type DistributionOverviewDto, type JobDistributionDto, type PublicFeedDto } from '@tt/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createKey, withKey } from './testing/api-keys.js';
import { TestUser } from './testing/client.js';
import { publishNotice } from './testing/privacy.js';
import { createTestApp, uniqueEmail, WEB_ORIGIN, type TestApp } from './testing/test-app.js';

let t: TestApp;
let channel: FakeDistributionChannel;
beforeAll(async () => {
  channel = createFakeDistributionChannel('fake-board', 'Fake board');
  t = await createTestApp({ distributionChannels: [channel] });
});
afterAll(async () => {
  await t.close();
});

const EVIL = 'https://evil.example';
const user = (label: string) => new TestUser(t.app, uniqueEmail(label), `User ${label}`);

async function team() {
  const owner = await user('owner').signUp();
  await owner.createOrganization('Dist Org');
  await publishNotice(owner);
  const [admin, recruiter, hm, interviewer] = [user('admin'), user('rec'), user('hm'), user('int')];
  for (const [member, role] of [[admin, 'admin'], [recruiter, 'recruiter'], [hm, 'hiring_manager'], [interviewer, 'interviewer']] as const) {
    await member.signUp();
    await member.joinAs(owner, role);
  }
  return { owner, admin, recruiter, hm, interviewer, slug: owner.organizationSlug };
}

async function publishedJob(owner: TestUser, title = 'Backend Developer'): Promise<{ id: string; slug: string }> {
  const created = await owner.post<{ id: string; slug: string }>('/api/v1/jobs', { content: completeJobContent({ title }) });
  const { id, slug } = created.body.data!;
  expect((await owner.post(`/api/v1/jobs/${id}/publish`)).status).toBe(200);
  return { id, slug };
}

const get = (url: string, origin?: string) => t.app.inject({ method: 'GET', url, ...(origin ? { headers: { origin } } : {}) });

describe('public organization summary', () => {
  it('names the organization, links the careers page and the feed, counts open ads, and is cacheable', async () => {
    const { owner, slug } = await team();
    const empty = await get(`/api/v1/public/organizations/${slug}`);
    expect(empty.statusCode).toBe(200);
    expect(empty.headers['cache-control']).toContain('s-maxage');
    expect(empty.json().data).toEqual({
      name: 'Dist Org',
      slug,
      logo: null,
      careersUrl: `${WEB_ORIGIN}/careers/${slug}`,
      feedUrl: `${WEB_ORIGIN}/careers/${slug}/jobs.xml`,
      openPositions: 0,
    });
    const draft = await owner.post<{ id: string }>('/api/v1/jobs', { content: completeJobContent() });
    expect(draft.status).toBe(201);
    await publishedJob(owner);
    expect((await get(`/api/v1/public/organizations/${slug}`)).json().data.openPositions).toBe(1);
  });

  it('is 404 without cache headers for an unknown organization, and carries no ids of people', async () => {
    const missing = await get('/api/v1/public/organizations/nope-nope');
    expect(missing.statusCode).toBe(404);
    expect(missing.headers['cache-control']).toBeUndefined();
    const { slug } = await team();
    expect((await get(`/api/v1/public/organizations/${slug}`)).body).not.toMatch(/createdBy|user_|"id"/);
  });
});

describe('public feed contents', () => {
  it('lists the list summaries with their last edit and serves the full contents of published ads only', async () => {
    const { owner, slug } = await team();
    const { slug: jobSlug } = await publishedJob(owner, 'Open role');
    await owner.post('/api/v1/jobs', { content: completeJobContent({ title: 'Hidden draft' }) });
    const closed = await publishedJob(owner, 'Closed role');
    const closedJob = await owner.get<{ id: string }>(`/api/v1/jobs/${closed.id}`);
    expect((await owner.post(`/api/v1/jobs/${closedJob.body.data!.id}/close`)).status).toBe(200);

    const list = (await get(`/api/v1/public/organizations/${slug}/jobs`)).json().data.jobs;
    expect(list.map((job: { slug: string }) => job.slug)).toEqual([jobSlug]);
    expect(list[0]).toMatchObject({ title: 'Open role', salary: { min: 35000, max: 45000 }, stageCount: 2, responseDays: 5, location: { country: 'IT' }, contractType: 'permanent' });
    expect(list[0].updatedAt).toEqual(expect.any(String));

    const reply = await get(`/api/v1/public/organizations/${slug}/feed`);
    expect(reply.statusCode).toBe(200);
    expect(reply.headers['cache-control']).toContain('s-maxage');
    const feed = reply.json().data as PublicFeedDto;
    expect(feed.jobs.map((job) => job.slug)).toEqual([jobSlug]);
    expect(feed.jobs[0]).toMatchObject({ content: { summary: 'Build the core API.', responsibilities: ['Design APIs', 'Review code', 'Operate services'] }, publishedAt: expect.any(String), updatedAt: expect.any(String) });
    expect(reply.body).not.toMatch(/Hidden draft|Closed role|quality|createdBy/);
    expect((await get('/api/v1/public/organizations/nope-nope/feed')).statusCode).toBe(404);
  });

  it('is enough to build a well-formed XML feed with the ad in it', async () => {
    const { owner, slug } = await team();
    const { slug: jobSlug } = await publishedJob(owner, 'R&D <Engineer>');
    const feed = (await get(`/api/v1/public/organizations/${slug}/feed`)).json().data as PublicFeedDto;
    const xml = buildJobsFeedXml({ organization: feed.organization, jobs: feed.jobs, baseUrl: WEB_ORIGIN, now: new Date('2026-10-15T00:00:00Z') });
    const jobs = childrenNamed(parseXml(xml), 'job');
    expect(jobs).toHaveLength(1);
    expect(childText(jobs[0]!, 'title')).toBe('R&D <Engineer>');
    expect(childText(jobs[0]!, 'url')).toBe(`${WEB_ORIGIN}/careers/${slug}/${jobSlug}`);
    expect(childText(jobs[0]!, 'salary')).toBe('35000-45000 EUR per year');
  });
});

describe('CORS', () => {
  const publicUrls = (slug: string) => [`/api/v1/public/organizations/${slug}`, `/api/v1/public/organizations/${slug}/jobs`, `/api/v1/public/organizations/${slug}/feed`];

  it('opens every public GET to any origin, without credentials', async () => {
    const { slug } = await team();
    for (const origin of [EVIL, WEB_ORIGIN, undefined]) {
      for (const url of publicUrls(slug)) {
        const response = await get(url, origin);
        expect(response.statusCode, url).toBe(200);
        expect(response.headers['access-control-allow-origin'], `${origin} ${url}`).toBe('*');
        expect(response.headers['access-control-allow-credentials']).toBeUndefined();
      }
    }
  });

  it('opens the public single ad and the errors of the public routes too', async () => {
    const { owner, slug } = await team();
    const { slug: jobSlug } = await publishedJob(owner);
    expect((await get(`/api/v1/public/organizations/${slug}/jobs/${jobSlug}`, EVIL)).headers['access-control-allow-origin']).toBe('*');
    expect((await get('/api/v1/public/organizations/nope-nope', EVIL)).headers['access-control-allow-origin']).toBe('*');
  });

  it('does not open authenticated routes, nor the public application POST', async () => {
    const { owner, slug } = await team();
    const jobs = await get('/api/v1/jobs', EVIL);
    expect(jobs.statusCode).toBe(401);
    expect(jobs.headers['access-control-allow-origin']).toBeUndefined();
    const trusted = await owner.download('/api/v1/jobs');
    expect(trusted.headers['access-control-allow-origin']).toBe(WEB_ORIGIN);
    expect(trusted.headers['access-control-allow-credentials']).toBe('true');
    const apply = await t.app.inject({ method: 'POST', url: `/api/v1/public/organizations/${slug}/jobs/x/applications`, headers: { origin: EVIL } });
    expect(apply.headers['access-control-allow-origin']).not.toBe('*');
    for (const url of ['/api/v1/openapi.json', '/api/v1/health']) {
      expect((await get(url, EVIL)).headers['access-control-allow-origin']).toBeUndefined();
    }
  });
});

describe('job distribution with a registered channel', () => {
  it('shows the feed and a pending channel, then the channel answer after a sync, then removal after closing', async () => {
    const { owner, slug } = await team();
    const { id, slug: jobSlug } = await publishedJob(owner);
    const before = (await owner.get<JobDistributionDto[]>(`/api/v1/jobs/${id}/distribution`)).body.data!;
    expect(before.map((row) => [row.channelId, row.label, row.status])).toEqual([['feed', 'Feed XML', 'published'], ['fake-board', 'Fake board', 'pending']]);
    expect(before[0]!.url).toBe(`${WEB_ORIGIN}/careers/${slug}/jobs.xml`);

    const synced = await owner.post<JobDistributionDto[]>(`/api/v1/jobs/${id}/distribution/sync`);
    expect(synced.status).toBe(200);
    expect(synced.body.data![1]).toMatchObject({ channelId: 'fake-board', status: 'published', url: `https://board.test/${jobSlug}`, error: null });
    expect((await owner.get<JobDistributionDto[]>(`/api/v1/jobs/${id}/distribution`)).body.data![1]).toMatchObject({ status: 'published' });
    const audit = await owner.get<{ action: string; target: { id: string } }[]>('/api/v1/audit-log?action=job.distribution_synced');
    expect(audit.body.data!.some((event) => event.target.id === id)).toBe(true);

    expect((await owner.post(`/api/v1/jobs/${id}/close`)).status).toBe(200);
    const closed = (await owner.post<JobDistributionDto[]>(`/api/v1/jobs/${id}/distribution/sync`)).body.data!;
    expect(closed.map((row) => [row.channelId, row.status])).toEqual([['feed', 'removed'], ['fake-board', 'removed']]);
    expect(channel.calls().filter((call) => call.kind === 'remove').length).toBeGreaterThan(0);
  });

  it('records a failing channel with its reason instead of failing the request, and recovers on the next sync', async () => {
    const { owner } = await team();
    const { id } = await publishedJob(owner);
    channel.fail('board unavailable');
    const failed = await owner.post<JobDistributionDto[]>(`/api/v1/jobs/${id}/distribution/sync`);
    channel.succeed();
    expect(failed.status).toBe(200);
    expect(failed.body.data![1]).toMatchObject({ status: 'failed', error: 'board unavailable' });
    expect((await owner.post<JobDistributionDto[]>(`/api/v1/jobs/${id}/distribution/sync`)).body.data![1]).toMatchObject({ status: 'published', error: null });
  });

  it('lists the channels of the organization, switches one off, and a sync then takes the ad down from it', async () => {
    const { owner, admin } = await team();
    const { id } = await publishedJob(owner);
    await owner.post(`/api/v1/jobs/${id}/distribution/sync`);
    const overview = (await owner.get<DistributionOverviewDto>('/api/v1/distribution')).body.data!;
    expect(overview.feedUrl).toMatch(/\/careers\/.+\/jobs\.xml$/);
    expect(overview.llmsTxtUrl).toMatch(/\/careers\/.+\/llms\.txt$/);
    expect(overview.channels).toEqual([
      { channelId: 'feed', label: 'Feed XML', builtIn: true, enabled: true },
      { channelId: 'fake-board', label: 'Fake board', builtIn: false, enabled: true },
    ]);
    const off = await admin.put<DistributionChannelDto>('/api/v1/distribution/channels/fake-board', { enabled: false });
    expect(off.status).toBe(200);
    expect(off.body.data).toMatchObject({ channelId: 'fake-board', enabled: false });
    expect((await owner.get<DistributionOverviewDto>('/api/v1/distribution')).body.data!.channels[1]!.enabled).toBe(false);
    const after = (await owner.post<JobDistributionDto[]>(`/api/v1/jobs/${id}/distribution/sync`)).body.data!;
    expect(after[1]).toMatchObject({ channelId: 'fake-board', status: 'removed' });
    expect((await owner.get('/api/v1/audit-log?action=distribution.channel_updated')).status).toBe(200);
  });

  it('refuses to switch the feed, an unknown channel and a body that is not a boolean', async () => {
    const { owner } = await team();
    expect((await owner.put('/api/v1/distribution/channels/feed', { enabled: false })).status).toBe(422);
    expect((await owner.put('/api/v1/distribution/channels/nope', { enabled: false })).status).toBe(404);
    expect((await owner.put('/api/v1/distribution/channels/fake-board', { enabled: 'no' })).status).toBe(422);
    expect((await owner.put('/api/v1/distribution/channels/fake-board', {})).status).toBe(422);
  });
});

describe('distribution permissions', () => {
  it('lets every member read, only recruiters and above sync, only owners and admins switch channels', async () => {
    const { owner, admin, recruiter, hm, interviewer } = await team();
    const { id } = await publishedJob(owner);
    for (const member of [owner, admin, recruiter, hm, interviewer]) {
      expect((await member.get(`/api/v1/jobs/${id}/distribution`)).status).toBe(200);
      expect((await member.get('/api/v1/distribution')).status).toBe(200);
    }
    for (const [member, status] of [[owner, 200], [admin, 200], [recruiter, 200], [hm, 403], [interviewer, 403]] as const) {
      expect((await member.post(`/api/v1/jobs/${id}/distribution/sync`)).status).toBe(status);
    }
    for (const [member, status] of [[owner, 200], [admin, 200], [recruiter, 403], [hm, 403], [interviewer, 403]] as const) {
      expect((await member.put('/api/v1/distribution/channels/fake-board', { enabled: true })).status).toBe(status);
    }
  });

  it('answers 401 to anonymous callers and 404 for the job of another organization', async () => {
    const { owner } = await team();
    const { id } = await publishedJob(owner);
    const anon = user('anon');
    expect((await anon.get(`/api/v1/jobs/${id}/distribution`)).status).toBe(401);
    expect((await anon.post(`/api/v1/jobs/${id}/distribution/sync`)).status).toBe(401);
    expect((await anon.get('/api/v1/distribution')).status).toBe(401);
    expect((await anon.put('/api/v1/distribution/channels/fake-board', { enabled: true })).status).toBe(401);
    const other = await team();
    expect((await other.owner.get(`/api/v1/jobs/${id}/distribution`)).status).toBe(404);
    expect((await other.owner.post(`/api/v1/jobs/${id}/distribution/sync`)).status).toBe(404);
  });

  it('gives an API key the sync only with the job:publish scope, and never the channel switch', async () => {
    const { owner } = await team();
    const { id } = await publishedJob(owner);
    const reader = await createKey(owner, ['job:read']);
    const publisher = await createKey(owner, ['job:read', 'job:publish']);
    expect((await withKey(t.app, reader.secret, 'GET', `/api/v1/jobs/${id}/distribution`)).status).toBe(200);
    expect((await withKey(t.app, reader.secret, 'POST', `/api/v1/jobs/${id}/distribution/sync`)).status).toBe(403);
    expect((await withKey(t.app, publisher.secret, 'POST', `/api/v1/jobs/${id}/distribution/sync`)).status).toBe(200);
    expect((await withKey(t.app, publisher.secret, 'PUT', '/api/v1/distribution/channels/fake-board', { body: { enabled: false } })).status).toBe(403);
  });
});

describe('open source default: no channel registered', () => {
  it('shows only the computed feed row and lists only the feed as a channel', async () => {
    const plain = await createTestApp();
    try {
      const owner = await new TestUser(plain.app, uniqueEmail('plain'), 'Plain').signUp();
      await owner.createOrganization('Plain Org');
      await publishNotice(owner);
      const created = await owner.post<{ id: string }>('/api/v1/jobs', { content: completeJobContent() });
      const id = created.body.data!.id;
      await owner.post(`/api/v1/jobs/${id}/publish`);
      expect((await owner.get<JobDistributionDto[]>(`/api/v1/jobs/${id}/distribution`)).body.data!.map((row) => [row.channelId, row.status])).toEqual([['feed', 'published']]);
      expect((await owner.post<JobDistributionDto[]>(`/api/v1/jobs/${id}/distribution/sync`)).body.data).toHaveLength(1);
      expect((await owner.get<DistributionOverviewDto>('/api/v1/distribution')).body.data!.channels.map((c) => c.channelId)).toEqual(['feed']);
      expect((await owner.put('/api/v1/distribution/channels/fake-board', { enabled: false })).status).toBe(404);
    } finally {
      await plain.close();
    }
  });
});
