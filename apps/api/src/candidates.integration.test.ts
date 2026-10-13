import { createDrizzleCvExtractions } from '@tt/core';
import { completePrivacyNoticeInput } from '@tt/core/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TestUser } from './testing/client.js';
import { createWorld, personForm, publishJob, type World } from './testing/candidate-world.js';
import { createTestApp, uniqueEmail, type TestApp } from './testing/test-app.js';

interface Card {
  id: string;
  stageId: string;
  outcome: string | null;
  noteCount: number;
  candidate: { id: string; firstName: string };
}
interface Pipeline {
  stages: { id: string; declared: string | null; count: number }[];
  applications: Card[];
}
interface Detail {
  candidate: { id: string; email: string; tags: string[]; retentionExpiresAt: string };
  applications: { id: string; consent: { privacyNoticeVersion: number; scopes: string[] }; retentionExpiresAt: string; extraction: { status: string } }[];
  notes: { body: string; author: { name: string } }[];
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

const pipelineOf = async (w: World, jobId = w.job.id) => (await w.owner.get<Pipeline>(`/api/v1/jobs/${jobId}/pipeline`)).body.data!;

describe('the whole application story', () => {
  it('goes from notice and public page to a decided, audited application with a downloadable CV', async () => {
    const w = await createWorld(t);
    const page = await t.app.inject({ method: 'GET', url: `/api/v1/public/organizations/${w.slug}/jobs/${w.job.slug}` });
    expect(JSON.parse(page.body).data.privacyNotice).toMatchObject({ version: 1, language: 'it', contactEmail: 'privacy@acme.example' });

    const applied = await w.submit(personForm({ email: 'giulia@example.com' }));
    expect(applied.statusCode).toBe(201);
    expect(JSON.parse(applied.body)).toEqual({ success: true, data: { received: true }, error: null });
    expect(t.queue.jobs().map((j) => j.name).slice(-3)).toEqual(['cv.extract', 'automation.run', 'email.send']);

    const board = await pipelineOf(w);
    expect(board.stages[0]).toMatchObject({ id: 'received', count: 1 });
    const card = board.applications[0]!;
    expect(card).toMatchObject({ stageId: 'received', outcome: null });

    const next = board.stages[1]!.id;
    const moved = await w.owner.post<Card>(`/api/v1/applications/${card.id}/move`, { stageId: next });
    expect(moved.body.data).toMatchObject({ stageId: next });
    const decided = await w.owner.post<Card>(`/api/v1/applications/${card.id}/decide`, { outcome: 'hired' });
    expect(decided.body.data).toMatchObject({ outcome: 'hired' });
    expect((await w.owner.post(`/api/v1/applications/${card.id}/move`, { stageId: 'received' })).status).toBe(409);
    expect((await w.owner.post(`/api/v1/applications/${card.id}/decide`, { outcome: 'withdrawn' })).status).toBe(409);

    const detail = (await w.owner.get<Detail>(`/api/v1/candidates/${card.candidate.id}`)).body.data!;
    expect(detail.candidate.email).toBe('giulia@example.com');
    expect(detail.applications[0]).toMatchObject({ consent: { privacyNoticeVersion: 1, scopes: ['selection'] }, extraction: { status: 'pending' } });
    expect(new Date(detail.applications[0]!.retentionExpiresAt).getTime()).toBeGreaterThan(Date.now());

    const cv = await w.owner.download(`/api/v1/applications/${card.id}/cv?disposition=inline`);
    expect(cv.statusCode).toBe(200);
    expect(cv.headers).toMatchObject({
      'content-type': 'application/pdf',
      'cache-control': 'private, no-store',
      'x-content-type-options': 'nosniff',
      'content-security-policy': 'sandbox',
    });
    expect(cv.headers['content-disposition']).toMatch(/^inline; filename="Giulia Bianchi\.pdf"; filename\*=UTF-8''Giulia%20Bianchi\.pdf$/);
    expect(cv.rawPayload.subarray(0, 5).toString()).toBe('%PDF-');

    const log = (await w.owner.get<Audit[]>('/api/v1/audit-log?limit=100')).body.data!.map((e) => e.action);
    for (const action of ['privacy_notice.published', 'application.received', 'application.moved', 'application.decided', 'candidate.viewed', 'candidate.cv_downloaded']) {
      expect(log).toContain(action);
    }
  });

  it('serves a download as attachment unless it is a PDF asked inline, with no sandbox header', async () => {
    const w = await createWorld(t);
    await w.submit();
    const card = (await pipelineOf(w)).applications[0]!;
    const cv = await w.owner.download(`/api/v1/applications/${card.id}/cv`);
    expect(cv.headers['content-disposition']).toMatch(/^attachment; /);
    expect(cv.headers['content-security-policy']).toBeUndefined();
  });

  it('keeps the same candidate across jobs: one profile, two applications', async () => {
    const w = await createWorld(t);
    const second = await publishJob(w.owner, 'Frontend Developer');
    const form = personForm({ email: 'same@example.com' });
    expect((await w.submit(form)).statusCode).toBe(201);
    expect((await w.submit({ ...form, firstName: 'Giuliana' }, { job: second })).statusCode).toBe(201);
    const one = (await pipelineOf(w)).applications[0]!;
    const two = (await pipelineOf(w, second.id)).applications[0]!;
    expect(two.candidate.id).toBe(one.candidate.id);
    const detail = (await w.owner.get<Detail>(`/api/v1/candidates/${one.candidate.id}`)).body.data!;
    expect(detail.applications).toHaveLength(2);
  });
});

describe('roles and isolation', () => {
  it('lets each role do only what the matrix says', async () => {
    const w = await createWorld(t);
    await w.submit();
    const card = (await pipelineOf(w)).applications[0]!;
    const next = (await pipelineOf(w)).stages[1]!.id;
    const [hm, interviewer, recruiter] = [await w.member('hiring_manager'), await w.member('interviewer'), await w.member('recruiter')];

    expect((await hm.post(`/api/v1/applications/${card.id}/decide`, { outcome: 'hired' })).status).toBe(403);
    expect((await hm.post(`/api/v1/applications/${card.id}/move`, { stageId: next })).status).toBe(200);
    expect((await interviewer.post(`/api/v1/applications/${card.id}/move`, { stageId: 'received' })).status).toBe(403);
    expect((await interviewer.get(`/api/v1/jobs/${w.job.id}/pipeline`)).status).toBe(200);
    const note = await interviewer.post<{ body: string; author: { name: string } }>(`/api/v1/candidates/${card.candidate.id}/notes`, { body: 'Colloquio positivo', applicationId: card.id });
    expect(note.status).toBe(201);
    expect(note.body.data).toMatchObject({ body: 'Colloquio positivo', author: { name: 'interviewer' } });
    expect((await interviewer.patch(`/api/v1/candidates/${card.candidate.id}`, { tags: ['x'] })).status).toBe(403);
    expect((await hm.post('/api/v1/privacy-notice', completePrivacyNoticeInput())).status).toBe(403);
    expect((await recruiter.get('/api/v1/privacy-notice/versions')).status).toBe(403);
    expect((await recruiter.get('/api/v1/privacy-notice')).status).toBe(200);
    expect((await recruiter.post(`/api/v1/applications/${card.id}/decide`, { outcome: 'not_selected' })).status).toBe(200);
  });

  it('answers 401 to anonymous callers on every authenticated route', async () => {
    const w = await createWorld(t);
    const anon = new TestUser(t.app, uniqueEmail('anon'), 'Anon');
    const calls = [
      anon.get('/api/v1/privacy-notice'),
      anon.get(`/api/v1/jobs/${w.job.id}/pipeline`),
      anon.get('/api/v1/candidates'),
      anon.get('/api/v1/candidates/x'),
      anon.get('/api/v1/applications/x/cv'),
      anon.post('/api/v1/applications/x/move', { stageId: 'received' }),
      anon.post('/api/v1/applications/x/decide', { outcome: 'hired' }),
      anon.post('/api/v1/candidates/x/notes', { body: 'x' }),
    ];
    expect((await Promise.all(calls)).map((r) => r.status)).toEqual(Array(calls.length).fill(401));
  });

  it('hides everything of another organization behind 404', async () => {
    const a = await createWorld(t, 'Alpha');
    const b = await createWorld(t, 'Beta');
    await a.submit();
    const card = (await pipelineOf(a)).applications[0]!;
    const { owner } = b;
    expect((await owner.get(`/api/v1/jobs/${a.job.id}/pipeline`)).status).toBe(404);
    expect((await owner.get(`/api/v1/candidates/${card.candidate.id}`)).status).toBe(404);
    expect((await owner.patch(`/api/v1/candidates/${card.candidate.id}`, { tags: ['x'] })).status).toBe(404);
    expect((await owner.post(`/api/v1/candidates/${card.candidate.id}/notes`, { body: 'x' })).status).toBe(404);
    expect((await owner.post(`/api/v1/applications/${card.id}/move`, { stageId: 'received' })).status).toBe(404);
    expect((await owner.post(`/api/v1/applications/${card.id}/decide`, { outcome: 'hired' })).status).toBe(404);
    expect((await owner.download(`/api/v1/applications/${card.id}/cv`)).statusCode).toBe(404);
    expect((await owner.get<unknown[]>('/api/v1/candidates')).body.meta?.total).toBe(0);
  });
});

describe('candidate search', () => {
  it('finds by name, tag and CV text, and paginates', async () => {
    const w = await createWorld(t);
    await w.submit(personForm({ firstName: 'Giulia', lastName: 'Rossetti', email: 'giulia.r@example.com' }));
    await w.submit(personForm({ firstName: 'Marco', lastName: 'Verdi', email: 'marco.v@example.com' }));
    const cards = (await pipelineOf(w)).applications;
    const marco = cards.find((c) => c.candidate.firstName === 'Marco')!;
    const tagged = await w.owner.patch<Detail>(`/api/v1/candidates/${marco.candidate.id}`, { tags: ['Kubernetes ', 'senior'] });
    expect(tagged.body.data!.candidate.tags).toEqual(['kubernetes', 'senior']);
    await createDrizzleCvExtractions(t.handle.db).upsert({
      applicationId: marco.id,
      organizationId: await orgIdOf(w),
      status: 'text_only',
      text: 'Esperienza decennale con Terraform e AWS',
      data: null,
      source: 'text',
      updatedAt: new Date(),
    });

    const names = async (qs: string) => (await w.owner.get<{ firstName: string }[]>(`/api/v1/candidates?${qs}`)).body.data!.map((c) => c.firstName);
    expect(await names('query=Rossetti')).toEqual(['Giulia']);
    expect(await names('tag=senior')).toEqual(['Marco']);
    expect(await names('query=terraform')).toEqual(['Marco']);
    expect(await names('query=nessuno')).toEqual([]);
    const page = await w.owner.get<unknown[]>('/api/v1/candidates?page=2&limit=1');
    expect(page.body.meta).toMatchObject({ total: 2, page: 2, limit: 1 });
    expect((await w.owner.get('/api/v1/candidates?page=abc')).status).toBe(422);
  });
});

async function orgIdOf(w: World): Promise<string> {
  const reply = await w.owner.get<{ id: string }>('/api/auth/organization/get-full-organization');
  return (reply.body as unknown as { id: string }).id;
}
