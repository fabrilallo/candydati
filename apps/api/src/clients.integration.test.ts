import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createKey, withKey } from './testing/api-keys.js';
import type { World } from './testing/candidate-world.js';
import { applyAs, createWorld } from './testing/privacy-world.js';
import { createTestApp, type TestApp } from './testing/test-app.js';

let t: TestApp;
beforeAll(async () => {
  t = await createTestApp();
});
afterAll(async () => {
  await t.close();
});

interface ClientBody {
  id: string;
  contacts: { id: string; email: string }[];
}
interface ShortlistBody {
  id: string;
  status: string;
  items: { applicationId: string; candidateNotified: boolean; answer: string | null }[];
}
interface PublicBody {
  agencyName: string;
  candidates: { itemId: string; firstName: string; hasCv: boolean }[];
}

const anonymous = (method: 'GET' | 'POST', url: string, payload?: object) => t.app.inject({ method, url, ...(payload ? { payload } : {}) });
const tokenFor = (to: string): string => {
  const mail = t.emailSender.sent().filter((m) => m.to === to).at(-1);
  const match = /\/shortlist\/([a-z0-9]+)/.exec(mail?.text ?? '');
  if (!match?.[1]) throw new Error(`no shortlist link sent to ${to}`);
  return match[1];
};

async function agency(w: World, display: 'named' | 'confidential' = 'named'): Promise<{ client: ClientBody; contactEmail: string }> {
  expect((await w.owner.put('/api/v1/settings/agency', { recruitsForClients: true, agencyAuthorization: 'Aut. Min. Lav. test' })).status).toBe(200);
  const contactEmail = `contact-${w.slug}@client.example`;
  const created = await w.owner.post<ClientBody>('/api/v1/clients', { name: `Client of ${w.slug}`, website: 'https://client.example', contacts: [{ name: 'Carla Contact', email: contactEmail }] });
  expect(created.status).toBe(201);
  const client = created.body.data!;
  expect((await w.owner.put(`/api/v1/jobs/${w.job.id}/client`, { clientId: client.id, display })).status).toBe(200);
  return { client, contactEmail };
}

describe('clients of an agency', () => {
  it('stays off until the organization recruits for clients, then lists clients and shows them on the job list', async () => {
    const w = await createWorld(t);
    expect((await w.owner.get('/api/v1/settings/agency')).body.data).toEqual({ recruitsForClients: false, agencyAuthorization: null });
    expect((await w.owner.post('/api/v1/clients', { name: 'Too early' })).status).toBe(409);
    const { client } = await agency(w);
    expect((await w.owner.get<ClientBody[]>('/api/v1/clients')).body.data).toEqual([expect.objectContaining({ id: client.id, jobCount: 1 })]);
    const jobs = await w.owner.get<{ id: string; client: { id: string } | null }[]>(`/api/v1/jobs?clientId=${client.id}`);
    expect(jobs.body.data).toEqual([expect.objectContaining({ id: w.job.id, client: { id: client.id, name: `Client of ${w.slug}`, display: 'named' } })]);
    expect((await w.owner.get(`/api/v1/reports?from=2026-01-01T00:00:00Z&to=2026-12-31T00:00:00Z&clientId=${client.id}`)).body.data).toMatchObject({ clientId: client.id });
  });

  it('shows a named client on the public ad and never names a confidential one', async () => {
    const named = await createWorld(t);
    const { client } = await agency(named);
    const page = (await anonymous('GET', `/api/v1/public/organizations/${named.slug}/jobs/${named.job.slug}`)).json().data;
    expect(page.job.client).toEqual({ display: 'named', name: `Client of ${named.slug}`, website: 'https://client.example', logo: null, agencyAuthorization: 'Aut. Min. Lav. test' });
    const hidden = await createWorld(t);
    await agency(hidden, 'confidential');
    const body = (await anonymous('GET', `/api/v1/public/organizations/${hidden.slug}/jobs/${hidden.job.slug}`)).body;
    expect(body).not.toContain(`Client of ${hidden.slug}`);
    expect(JSON.parse(body).data.job.client.display).toBe('confidential');
    expect(client.contacts[0]?.email).toBeDefined();
  });

  it('lets an API key read clients but never manage them or send a shortlist', async () => {
    const w = await createWorld(t);
    const { client } = await agency(w);
    const key = await createKey(w.owner, ['client:read', 'job:read']);
    expect((await withKey(t.app, key.secret, 'GET', '/api/v1/clients')).status).toBe(200);
    expect((await withKey(t.app, key.secret, 'GET', `/api/v1/jobs/${w.job.id}/client`)).body.data).toMatchObject({ client: { id: client.id } });
    expect((await withKey(t.app, key.secret, 'POST', '/api/v1/clients', { body: { name: 'By key' } })).status).toBe(403);
    expect((await withKey(t.app, key.secret, 'POST', `/api/v1/jobs/${w.job.id}/shortlists`, { body: { contactId: 'x', candidates: [{ applicationId: 'y' }] } })).status).toBe(403);
    await expect(createKey(w.owner, ['shortlist:send'])).rejects.toThrow();
  });
});

describe('shortlists without login', () => {
  it('sends a personal link, tells the candidate, takes one answer per candidate and stops after revocation', async () => {
    const w = await createWorld(t);
    const { client, contactEmail } = await agency(w);
    const applied = await applyAs(w);
    const sent = await w.owner.post<ShortlistBody>(`/api/v1/jobs/${w.job.id}/shortlists`, {
      contactId: client.contacts[0]!.id,
      candidates: [{ applicationId: applied.applicationId, shareCv: true }],
    });
    expect(sent.status).toBe(201);
    expect(sent.body.data!.items).toEqual([expect.objectContaining({ applicationId: applied.applicationId, candidateNotified: true })]);
    expect(JSON.stringify(sent.body)).not.toMatch(/tokenHash/);
    const token = tokenFor(contactEmail);

    const opened = await anonymous('GET', `/api/v1/public/shortlists/${token}`);
    expect(opened.statusCode).toBe(200);
    expect(opened.headers['cache-control']).toBe('no-store');
    expect(opened.headers['x-robots-tag']).toBe('noindex, nofollow');
    const view = opened.json().data as PublicBody;
    expect(view.candidates).toEqual([expect.objectContaining({ firstName: applied.person.firstName, hasCv: true })]);
    expect(opened.body).not.toContain(applied.person.email);
    expect(opened.body).not.toContain(applied.applicationId);

    const item = view.candidates[0]!.itemId;
    const cv = await anonymous('GET', `/api/v1/public/shortlists/${token}/candidates/${item}/cv`);
    expect(cv.statusCode).toBe(200);
    expect(cv.headers['content-security-policy']).toBe('sandbox');
    expect((await anonymous('POST', `/api/v1/public/shortlists/${token}/answers`, { itemId: item, answer: 'meet', reason: '' })).statusCode).toBe(422);
    expect((await anonymous('POST', `/api/v1/public/shortlists/${token}/answers`, { itemId: item, answer: 'meet', reason: 'Strong profile' })).statusCode).toBe(200);
    expect((await anonymous('POST', `/api/v1/public/shortlists/${token}/answers`, { itemId: item, answer: 'not_for_us', reason: 'Changed' })).statusCode).toBe(409);

    const timeline = await w.owner.get<{ items: { kind: string }[] }>(`/api/v1/applications/${applied.applicationId}/timeline`);
    expect(timeline.body.data!.items.map((i) => i.kind)).toEqual(expect.arrayContaining(['shortlist_shared', 'client_answered']));
    const listed = await w.owner.get<ShortlistBody[]>(`/api/v1/jobs/${w.job.id}/shortlists`);
    expect(listed.body.data![0]).toMatchObject({ status: 'answered', items: [{ answer: 'meet' }] });

    expect((await w.owner.post(`/api/v1/shortlists/${sent.body.data!.id}/revoke`)).status).toBe(200);
    expect((await anonymous('GET', `/api/v1/public/shortlists/${token}`)).statusCode).toBe(404);
    expect((await anonymous('GET', `/api/v1/public/shortlists/${'a'.repeat(26)}`)).statusCode).toBe(404);
  });
});
