import { CV_MAX_BYTES } from '@tt/domain';
import { completeJobContent, completePrivacyNoticeInput, fakePdfBytes } from '@tt/core/testing';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createWorld, personForm, type World } from './testing/candidate-world.js';
import { TestUser } from './testing/client.js';
import { publishNotice } from './testing/privacy.js';
import { createTestApp, uniqueEmail, type TestApp } from './testing/test-app.js';

let t: TestApp;
beforeAll(async () => {
  t = await createTestApp();
});
afterAll(async () => {
  await t.close();
});

const body = (response: { body: string }) => JSON.parse(response.body) as { error: { code: string; message: string; issues?: { path: string; message: string }[] } | null };
const cardsOf = async (w: World) => (await w.owner.get<{ applications: unknown[] }>(`/api/v1/jobs/${w.job.id}/pipeline`)).body.data!.applications;

describe('public application', () => {
  it('answers 201 to a filled honeypot and stores nothing', async () => {
    const w = await createWorld(t);
    const queued = t.queue.jobs().length;
    const files = t.files.keys().length;
    const response = await w.submit(personForm({ website: 'http://spam.example' }));
    expect(response.statusCode).toBe(201);
    expect(await cardsOf(w)).toEqual([]);
    expect(t.queue.jobs()).toHaveLength(queued);
    expect(t.files.keys()).toHaveLength(files);
  });

  it('refuses an outdated notice version with 409 privacy_notice_outdated', async () => {
    const w = await createWorld(t);
    await publishNotice(w.owner);
    const response = await w.submit(personForm({ privacyNoticeVersion: 1 }));
    expect(response.statusCode).toBe(409);
    expect(body(response).error).toMatchObject({ code: 'conflict', message: 'privacy_notice_outdated' });
    expect((await w.submit(personForm({ privacyNoticeVersion: 2 }))).statusCode).toBe(201);
  });

  it('answers the same person twice on the same job like a success, storing nothing and revealing nothing', async () => {
    const w = await createWorld(t);
    const form = personForm({ email: 'twice@example.com' });
    const first = await w.submit(form);
    const files = t.files.keys().length;
    const again = await w.submit(form);
    expect(first.statusCode).toBe(201);
    expect(again.statusCode).toBe(201);
    expect(again.body).toBe(first.body);
    expect(await cardsOf(w)).toHaveLength(1);
    expect(t.files.keys()).toHaveLength(files);
  });

  it('refuses a file that is not a PDF or DOCX with 415, an empty or huge one with 422 and 413', async () => {
    const w = await createWorld(t);
    const text = await w.submit(undefined, { cv: new TextEncoder().encode('just some text'), fileName: 'cv.pdf' });
    expect(text.statusCode).toBe(415);
    expect(body(text).error).toMatchObject({ code: 'unsupported_file', issues: [{ path: 'cv', message: 'unsupported_file' }] });
    const empty = await w.submit(undefined, { cv: new Uint8Array() });
    expect(empty.statusCode).toBe(422);
    const huge = await w.submit(undefined, { cv: fakePdfBytes(CV_MAX_BYTES + 1) });
    expect(huge.statusCode).toBe(413);
    expect(body(huge).error?.code).toBe('payload_too_large');
    expect(await cardsOf(w)).toEqual([]);
  });

  it('accepts the form data whether the part is plain text or typed application/json', async () => {
    const w = await createWorld(t);
    expect((await w.submit(personForm(), { dataType: 'application/json' })).statusCode).toBe(201);
    expect(await cardsOf(w)).toHaveLength(1);
  });

  it('refuses a malformed submission: no file, bad JSON, extra parts, bad form', async () => {
    const w = await createWorld(t);
    expect((await w.submit(undefined, { cv: null })).statusCode).toBe(422);
    expect((await w.submit(undefined, { extraParts: [{ name: 'other', value: 'x' }] })).statusCode).toBe(422);
    expect((await w.submit(undefined, { extraParts: [{ name: 'cv', filename: 'b.pdf', bytes: fakePdfBytes() }] })).statusCode).toBe(422);
    expect((await w.submit({ ...personForm(), consentScopes: [] })).statusCode).toBe(422);
    const notJson = await t.app.inject({
      method: 'POST',
      url: `/api/v1/public/organizations/${w.slug}/jobs/${w.job.slug}/applications`,
      headers: { 'content-type': 'application/json' },
      payload: '{}',
    });
    expect(notJson.statusCode).toBeGreaterThanOrEqual(400);
    expect(await cardsOf(w)).toEqual([]);
  });

  it('answers 404 for draft, closed and unknown jobs and organizations', async () => {
    const w = await createWorld(t);
    const draft = (await w.owner.post<{ id: string; slug: string }>('/api/v1/jobs', { content: completeJobContent({ title: 'Draft' }) })).body.data!;
    expect((await w.submit(undefined, { job: draft })).statusCode).toBe(404);
    await w.owner.post(`/api/v1/jobs/${w.job.id}/close`);
    expect((await w.submit()).statusCode).toBe(404);
    expect((await w.submit(undefined, { job: { id: 'x', slug: 'nope' } })).statusCode).toBe(404);
  });

  it('refuses to publish a job while the organization has no privacy notice', async () => {
    const owner = await new TestUser(t.app, uniqueEmail('bare'), 'Bare').signUp();
    await owner.createOrganization('Bare');
    const job = (await owner.post<{ id: string }>('/api/v1/jobs', { content: completeJobContent() })).body.data!;
    const refused = await owner.post(`/api/v1/jobs/${job.id}/publish`);
    expect(refused.status).toBe(422);
    expect(refused.body.error).toMatchObject({ issues: expect.arrayContaining([{ path: 'organization.privacyNotice', message: 'privacy_notice_required' }]) });
    expect((await owner.post('/api/v1/privacy-notice', completePrivacyNoticeInput())).status).toBe(201);
    expect((await owner.post(`/api/v1/jobs/${job.id}/publish`)).status).toBe(200);
  });

  it('serves a notice template with the organization name', async () => {
    const w = await createWorld(t, 'Zeta Srl');
    const template = await w.owner.get<{ text: string }>('/api/v1/privacy-notice/template?language=it');
    expect(template.status).toBe(200);
    expect(template.body.data!.text).toContain('Zeta Srl');
  });
});

describe('application rate limit', () => {
  it('allows the configured number per client, then answers 429', async () => {
    const limited = await createTestApp({ rateLimit: { max: 1000, authMax: 1000, applyMax: 2, applyWindowMinutes: 10 } });
    try {
      const w = await createWorld(limited);
      const statuses = [];
      for (let i = 0; i < 3; i += 1) statuses.push((await w.submit()).statusCode);
      expect(statuses).toEqual([201, 201, 429]);
    } finally {
      await limited.close();
    }
  });
});

describe('public application with Turnstile on', () => {
  let guarded: TestApp;
  beforeAll(async () => {
    guarded = await createTestApp({ env: { TURNSTILE_SECRET_KEY: 'secret-key' } });
  });
  afterAll(async () => {
    vi.unstubAllGlobals();
    await guarded.close();
  });

  it('refuses a submission without a valid answer, and accepts one the service confirms', async () => {
    const w = await createWorld(guarded);
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ success: false }))));
    const refused = await w.submit(personForm({ turnstileToken: 'bad' }));
    expect(refused.statusCode).toBe(422);
    expect(body(refused).error?.issues).toEqual([{ path: 'turnstile', message: 'captcha_failed' }]);
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ success: true }))));
    expect((await w.submit(personForm({ turnstileToken: 'good' }))).statusCode).toBe(201);
  });
});
