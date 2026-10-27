import { completeJobContent, fakeAdQualityAnalyzer, fixedQualityReport, throwingAdQualityAnalyzer, unavailableAdQualityAnalyzer } from '@candydati/core/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TestUser } from './testing/client.js';
import { publishNotice } from './testing/privacy.js';
import { createTestApp, uniqueEmail, type TestApp } from './testing/test-app.js';

interface JobBody {
  id: string;
  slug: string;
  status: string;
  publishIssues: unknown[];
  content: { title: string };
}
interface Audit {
  action: string;
  metadata: Record<string, unknown>;
}

let t: TestApp;
beforeAll(async () => {
  t = await createTestApp();
});
afterAll(async () => {
  await t.close();
});

const newUser = (label: string) => new TestUser(t.app, uniqueEmail(label), `User ${label}`);
const full = () => completeJobContent({ title: 'Backend Developer' });

async function team() {
  const owner = await newUser('owner').signUp();
  await owner.createOrganization('Acme');
  await publishNotice(owner);
  const hm = await newUser('hm').signUp();
  const interviewer = await newUser('int').signUp();
  await hm.joinAs(owner, 'hiring_manager');
  await interviewer.joinAs(owner, 'interviewer');
  return { owner, hm, interviewer };
}

describe('job lifecycle over HTTP', () => {
  it('runs the whole story from a bare draft to a closed public ad, auditing every step', async () => {
    const { owner } = await team();
    const slug = owner.organizationSlug;
    const publicList = () => t.app.inject({ method: 'GET', url: `/api/v1/public/organizations/${slug}/jobs` });

    const created = await owner.post<JobBody>('/api/v1/jobs', { content: { title: 'Backend Developer' } });
    expect(created.status).toBe(201);
    const job = created.body.data!;
    expect(job.status).toBe('draft');
    expect(job.publishIssues.length).toBeGreaterThan(0);

    const hidden = await publicList();
    expect(JSON.parse(hidden.body).data.jobs).toEqual([]);
    expect((await t.app.inject({ method: 'GET', url: `/api/v1/public/organizations/${slug}/jobs/${job.slug}` })).statusCode).toBe(404);

    const refused = await owner.post<unknown>(`/api/v1/jobs/${job.id}/publish`);
    expect(refused.status).toBe(422);
    expect(refused.body.error?.code).toBe('validation_failed');
    const issues = (refused.body.error as unknown as { issues: { path: string; message: string }[] }).issues;
    expect(issues.length).toBeGreaterThan(0);
    expect(issues.every((i) => typeof i.path === 'string' && typeof i.message === 'string')).toBe(true);

    const updated = await owner.put<JobBody>(`/api/v1/jobs/${job.id}`, { content: full() });
    expect(updated.status).toBe(200);
    expect(updated.body.data!.publishIssues).toEqual([]);

    const quality = await owner.post<{ assessment: { report: { total: number } }; publishIssues: unknown[] }>('/api/v1/jobs/quality', { content: full() });
    expect(quality.status).toBe(200);
    expect(quality.body.data!.publishIssues).toEqual([]);
    expect(quality.body.data!.assessment.report.total).toBe(8);
    expect(quality.body.data).toMatchObject({ status: 'assessed' });

    const published = await owner.post<{ job: JobBody; quality: { belowThreshold: boolean } }>(`/api/v1/jobs/${job.id}/publish`);
    expect(published.status).toBe(200);
    expect(published.body.data!.job.status).toBe('published');
    expect(published.body.data!.quality.belowThreshold).toBe(false);

    const listed = await publicList();
    expect(listed.statusCode).toBe(200);
    expect(JSON.parse(listed.body).data.jobs).toHaveLength(1);
    const page = await t.app.inject({ method: 'GET', url: `/api/v1/public/organizations/${slug}/jobs/${job.slug}` });
    expect(page.statusCode).toBe(200);
    expect(JSON.parse(page.body).data.job.slug).toBe(job.slug);

    const list = await owner.get<unknown[]>('/api/v1/jobs?status=published&page=1&limit=10');
    expect(list.body.meta).toMatchObject({ total: 1, page: 1, limit: 10 });
    expect((await owner.get<JobBody>(`/api/v1/jobs/${job.id}`)).body.data!.id).toBe(job.id);

    expect((await owner.post<JobBody>(`/api/v1/jobs/${job.id}/close`)).body.data!.status).toBe('closed');
    expect(JSON.parse((await publicList()).body).data.jobs).toEqual([]);

    const log = (await owner.get<Audit[]>('/api/v1/audit-log')).body.data!;
    const actions = log.map((e) => e.action);
    for (const action of ['job.created', 'job.updated', 'job.published', 'job.closed']) expect(actions).toContain(action);
    expect(log.find((e) => e.action === 'job.published')!.metadata).toMatchObject({ qualityStatus: 'assessed', qualityTotal: 8, belowThreshold: false, threshold: 6 });
  });

  it('answers 404 in the envelope for unknown organization and job slugs', async () => {
    const { owner } = await team();
    const org = await t.app.inject({ method: 'GET', url: '/api/v1/public/organizations/nope-nope/jobs' });
    expect(org.statusCode).toBe(404);
    expect(JSON.parse(org.body)).toMatchObject({ success: false, error: { code: 'not_found' } });
    expect(org.headers['cache-control']).toBeUndefined();
    const job = await t.app.inject({ method: 'GET', url: `/api/v1/public/organizations/${owner.organizationSlug}/jobs/nope` });
    expect(job.statusCode).toBe(404);
    expect(job.headers['cache-control']).toBeUndefined();
  });

  it('sends the cache header on public 200s only', async () => {
    const { owner } = await team();
    const ok = await t.app.inject({ method: 'GET', url: `/api/v1/public/organizations/${owner.organizationSlug}/jobs` });
    expect(ok.statusCode).toBe(200);
    expect(ok.headers['cache-control']).toBe('public, max-age=60, s-maxage=300, stale-while-revalidate=600');
  });
});

describe('roles and isolation', () => {
  it('lets a hiring manager draft but not publish or close; an interviewer cannot create', async () => {
    const { owner, hm, interviewer } = await team();
    const created = await hm.post<JobBody>('/api/v1/jobs', { content: full() });
    expect(created.status).toBe(201);
    const id = created.body.data!.id;
    expect((await hm.put(`/api/v1/jobs/${id}`, { content: full() })).status).toBe(200);
    expect((await hm.post(`/api/v1/jobs/${id}/publish`)).status).toBe(403);
    expect((await owner.post(`/api/v1/jobs/${id}/publish`)).status).toBe(200);
    expect((await hm.post(`/api/v1/jobs/${id}/close`)).status).toBe(403);
    expect((await interviewer.post('/api/v1/jobs', { content: full() })).status).toBe(403);
  });

  it('hides a job of another organization behind 404', async () => {
    const a = await newUser('a').signUp();
    await a.createOrganization('Alpha');
    const b = await newUser('b').signUp();
    await b.createOrganization('Beta');
    const id = (await a.post<JobBody>('/api/v1/jobs', { content: full() })).body.data!.id;
    expect((await b.get(`/api/v1/jobs/${id}`)).status).toBe(404);
    expect((await b.put(`/api/v1/jobs/${id}`, { content: full() })).status).toBe(404);
    expect((await b.post(`/api/v1/jobs/${id}/close`)).status).toBe(404);
  });

  it('answers 401 to anonymous callers on every non-public route', async () => {
    const anon = newUser('anon');
    const calls: [() => Promise<{ status: number }>][] = [
      [() => anon.get('/api/v1/jobs')],
      [() => anon.post('/api/v1/jobs', { content: {} })],
      [() => anon.get('/api/v1/jobs/x')],
      [() => anon.put('/api/v1/jobs/x', { content: {} })],
      [() => anon.post('/api/v1/jobs/x/publish')],
      [() => anon.post('/api/v1/jobs/x/close')],
      [() => anon.post('/api/v1/jobs/quality', { content: {} })],
      [() => anon.get('/api/v1/job-templates')],
      [() => anon.post('/api/v1/job-templates', { name: 'x', content: {} })],
      [() => anon.delete('/api/v1/job-templates/x')],
    ];
    for (const [call] of calls) expect((await call()).status).toBe(401);
  });
});

describe('templates', () => {
  it('creates, lists, uses and deletes a template', async () => {
    const { owner } = await team();
    const made = await owner.post<{ id: string }>('/api/v1/job-templates', { name: 'Backend', content: full() });
    expect(made.status).toBe(201);
    const templateId = made.body.data!.id;
    expect((await owner.get<unknown[]>('/api/v1/job-templates')).body.data).toHaveLength(1);
    const job = await owner.post<JobBody>('/api/v1/jobs', { content: { title: 'From template' }, templateId });
    expect(job.status).toBe(201);
    expect(job.body.data!.publishIssues).toEqual([]);
    expect((await owner.delete(`/api/v1/job-templates/${templateId}`)).body.data).toEqual({ id: templateId });
    expect((await owner.get<unknown[]>('/api/v1/job-templates')).body.data).toEqual([]);
    expect((await owner.delete(`/api/v1/job-templates/${templateId}`)).status).toBe(404);
  });
});

describe('quality scoring and publication', () => {
  it('publishes below the threshold and reports it', async () => {
    const low = await createTestApp({ adQuality: fakeAdQualityAnalyzer(fixedQualityReport(2)) });
    try {
      const owner = await new TestUser(low.app, uniqueEmail('low'), 'Low').signUp();
      await owner.createOrganization('Low');
      await publishNotice(owner);
      const id = (await owner.post<JobBody>('/api/v1/jobs', { content: full() })).body.data!.id;
      const published = await owner.post<{ quality: { belowThreshold: boolean } }>(`/api/v1/jobs/${id}/publish`);
      expect(published.status).toBe(200);
      expect(published.body.data!.quality.belowThreshold).toBe(true);
    } finally {
      await low.close();
    }
  });

  it('has no score anywhere without an AI model, and still checks the publication rules', async () => {
    const off = await createTestApp({ adQuality: unavailableAdQualityAnalyzer() });
    try {
      const owner = await new TestUser(off.app, uniqueEmail('noai'), 'NoAi').signUp();
      await owner.createOrganization('NoAi');
      await publishNotice(owner);
      const analyzed = await owner.post<{ status: string; assessment: unknown; publishIssues: unknown[] }>('/api/v1/jobs/quality', { content: { title: 'Dev' } });
      expect(analyzed.status).toBe(200);
      expect(analyzed.body.data).toMatchObject({ status: 'unavailable', assessment: null });
      expect(analyzed.body.data!.publishIssues.length).toBeGreaterThan(0);
      const id = (await owner.post<JobBody>('/api/v1/jobs', { content: full() })).body.data!.id;
      const published = await owner.post<{ job: JobBody & { quality: unknown }; quality: unknown; qualityStatus: string }>(`/api/v1/jobs/${id}/publish`);
      expect(published.status).toBe(200);
      expect(published.body.data).toMatchObject({ job: { status: 'published', quality: null }, quality: null, qualityStatus: 'unavailable' });
      const listed = await owner.get<{ qualityTotal: unknown; belowThreshold: boolean }[]>('/api/v1/jobs');
      expect(listed.body.data!.map(({ qualityTotal, belowThreshold }) => ({ qualityTotal, belowThreshold }))).toEqual([{ qualityTotal: null, belowThreshold: false }]);
      const stats = await owner.get<{ quality: { available: boolean; items: unknown[] } }>('/api/v1/stats/jobs');
      expect(stats.body.data!.quality).toMatchObject({ available: false, items: [] });
    } finally {
      await off.close();
    }
  });

  it('publishes even when the analyzer throws', async () => {
    const broken = await createTestApp({ adQuality: throwingAdQualityAnalyzer() });
    try {
      const owner = await new TestUser(broken.app, uniqueEmail('brk'), 'Brk').signUp();
      await owner.createOrganization('Brk');
      await publishNotice(owner);
      const id = (await owner.post<JobBody>('/api/v1/jobs', { content: full() })).body.data!.id;
      const published = await owner.post<{ job: JobBody; quality: unknown }>(`/api/v1/jobs/${id}/publish`);
      expect(published.status).toBe(200);
      expect(published.body.data).toMatchObject({ job: { status: 'published' }, quality: null, qualityStatus: 'failed' });
    } finally {
      await broken.close();
    }
  });
});
