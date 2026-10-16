import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createWorld, personForm, type World } from './testing/candidate-world.js';
import { createTestApp, type TestApp } from './testing/test-app.js';

const CHROME = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

let t: TestApp;
beforeAll(async () => {
  t = await createTestApp();
});
afterAll(async () => {
  await t.close();
});

const beacon = (url: string, headers: Record<string, string> = { 'user-agent': CHROME }) => t.app.inject({ method: 'POST', url, headers });
const viewUrl = (w: World, query = '', job = w.job.slug) => `/api/v1/public/organizations/${w.slug}/jobs/${job}/view${query}`;
const counters = async (jobId: string) =>
  (await t.handle.pool.query('select source, campaign, views, day::text as day from job_view_daily where job_id = $1 order by source, campaign', [jobId])).rows as {
    source: string;
    campaign: string;
    views: number;
    day: string;
  }[];

describe('POST .../jobs/:jobSlug/view', () => {
  it('answers 204 with no body and counts the visit under its source and campaign', async () => {
    const w = await createWorld(t);
    const reply = await beacon(viewUrl(w, '?source=LinkedIn&campaign=Autumn%202026'));
    expect(reply.statusCode).toBe(204);
    expect(reply.body).toBe('');
    expect(reply.headers['cache-control']).toBe('no-store');
    await beacon(viewUrl(w, '?source=linkedin&campaign=autumn-2026'));
    await beacon(viewUrl(w));
    expect(await counters(w.job.id)).toEqual([
      { source: 'direct', campaign: '', views: 1, day: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) },
      { source: 'linkedin', campaign: 'autumn-2026', views: 2, day: expect.any(String) },
    ]);
  });

  it('answers 204 and counts nothing for an unknown organization or ad, and for an ad that is not published', async () => {
    const w = await createWorld(t);
    const draft = await w.owner.post<{ id: string; slug: string }>('/api/v1/jobs', { content: { title: 'Draft only' } });
    const draftJob = draft.body.data!;
    expect((await beacon(`/api/v1/public/organizations/nope-nope/jobs/${w.job.slug}/view`)).statusCode).toBe(204);
    expect((await beacon(viewUrl(w, '', 'missing'))).statusCode).toBe(204);
    expect((await beacon(viewUrl(w, '', draftJob.slug))).statusCode).toBe(204);
    expect(await counters(w.job.id)).toEqual([]);
    expect(await counters(draftJob.id)).toEqual([]);
  });

  it('does not count crawlers, headless browsers or a request with no user agent', async () => {
    const w = await createWorld(t);
    for (const ua of ['Googlebot/2.1 (+http://www.google.com/bot.html)', 'Mozilla/5.0 HeadlessChrome/126.0', 'curl/8.4.0']) {
      expect((await beacon(viewUrl(w), { 'user-agent': ua })).statusCode).toBe(204);
    }
    expect((await beacon(viewUrl(w), { 'user-agent': '' })).statusCode).toBe(204);
    expect(await counters(w.job.id)).toEqual([]);
  });

  it('does not count a job through another organization, and keeps each organization to its own rows', async () => {
    const a = await createWorld(t, 'Views A');
    const b = await createWorld(t, 'Views B');
    await beacon(viewUrl(a));
    expect((await beacon(`/api/v1/public/organizations/${b.slug}/jobs/${a.job.slug}/view`)).statusCode).toBe(204);
    expect((await counters(a.job.id)).map((r) => r.views)).toEqual([1]);
    expect(await counters(b.job.id)).toEqual([]);
  });

  it('keeps nothing but counters: no personal data lands in the table', async () => {
    const w = await createWorld(t);
    await t.app.inject({ method: 'POST', url: viewUrl(w, '?source=mario.rossi@example.org&campaign=a@b.it'), headers: { 'user-agent': CHROME, 'x-forwarded-for': '203.0.113.9' } });
    const columns = (await t.handle.pool.query("select column_name from information_schema.columns where table_name = 'job_view_daily' order by column_name")).rows.map((r: { column_name: string }) => r.column_name);
    expect(columns).toEqual(['campaign', 'day', 'job_id', 'organization_id', 'source', 'views']);
    const [row] = await counters(w.job.id);
    expect(row).toMatchObject({ source: 'direct', campaign: '', views: 1 });
    expect(JSON.stringify(await t.handle.pool.query('select * from job_view_daily where job_id = $1', [w.job.id]).then((r) => r.rows))).not.toMatch(/203\.0\.113|Mozilla|example\.org/);
  });

  it('shows the counted visits, with conversion, in the reports', async () => {
    const w = await createWorld(t);
    for (let i = 0; i < 4; i += 1) await beacon(viewUrl(w, '?source=linkedin&campaign=autumn'));
    expect((await w.submit({ ...personForm(), origin: 'linkedin', campaign: 'autumn' })).statusCode).toBe(201);
    const from = new Date(Date.now() - 86_400_000).toISOString();
    const to = new Date(Date.now() + 86_400_000).toISOString();
    const report = (await w.owner.get<{ sources: unknown[]; campaigns: unknown[] }>(`/api/v1/reports?from=${from}&to=${to}`)).body.data!;
    expect(report.sources).toEqual([{ origin: 'linkedin', applications: 1, hires: 0, visits: 4, conversion: 0.25 }]);
    expect(report.campaigns).toEqual([{ origin: 'linkedin', campaign: 'autumn', applications: 1, hires: 0, visits: 4, conversion: 0.25 }]);
  });
});

describe('visit beacon rate limit', () => {
  it('answers 429 once a client is over its minute budget, so one client cannot inflate the counts', async () => {
    const limited = await createTestApp({ rateLimit: { max: 100_000, authMax: 100_000, publicMax: 100_000, viewMax: 3 } });
    try {
      const w = await createWorld(limited);
      const send = () => limited.app.inject({ method: 'POST', url: viewUrl(w), headers: { 'user-agent': CHROME } }).then((r) => r.statusCode);
      expect([await send(), await send(), await send(), await send(), await send()]).toEqual([204, 204, 204, 429, 429]);
      const rows = await limited.handle.pool.query('select sum(views)::int as views from job_view_daily where job_id = $1', [w.job.id]);
      expect(rows.rows[0].views).toBe(3);
    } finally {
      await limited.close();
    }
  });
});
