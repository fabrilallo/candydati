import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createWorld } from './testing/candidate-world.js';
import { createTestApp, type TestApp } from './testing/test-app.js';

interface Added { outcome: string; contactId: string | null; noticeUrl: string | null }
interface Contact { id: string; firstName: string; status: string; evidence: unknown[] }

let t: TestApp;
beforeAll(async () => {
  t = await createTestApp();
});
afterAll(async () => {
  await t.close();
});

const maja = { firstName: 'Maja', lastName: 'Lind', source: 'linkedin', profileUrl: 'https://www.linkedin.com/in/maja-lind', evidence: [{ criterion: 'Go', text: '4 years of Go' }] };
const tokenOf = (url: string | null): string => (url ?? '').split('/').pop() ?? '';
const anonymous = (method: 'GET' | 'POST', url: string) => t.app.inject({ method, url });

describe('sourcing over the api', () => {
  it('adds a found person as a contact with a personal notice link, which lets them see the data and erase it for good', async () => {
    const w = await createWorld(t);
    const added = await w.owner.post<Added[]>(`/api/v1/jobs/${w.job.id}/sourced-contacts`, { contacts: [maja, maja] });
    expect(added.status).toBe(201);
    expect(added.body.data!.map((r) => r.outcome)).toEqual(['added', 'already_contact']);
    const [contact] = (await w.owner.get<Contact[]>(`/api/v1/jobs/${w.job.id}/sourced-contacts`)).body.data!;
    expect(contact).toMatchObject({ firstName: 'Maja', status: 'found', evidence: [{ criterion: 'Go', text: '4 years of Go', where: null }] });
    expect(contact).not.toHaveProperty('noticeTokenHash');

    const notice = await w.owner.post<{ text: string; url: string }>(`/api/v1/sourced-contacts/${contact!.id}/notice`);
    expect(notice.body.data!.text).toContain(notice.body.data!.url);
    expect((await anonymous('GET', `/api/v1/public/sourcing-notice/${tokenOf(added.body.data![0]!.noticeUrl)}`)).statusCode).toBe(404);
    const page = await anonymous('GET', `/api/v1/public/sourcing-notice/${tokenOf(notice.body.data!.url)}`);
    expect(page.statusCode).toBe(200);
    expect(page.json().data).toMatchObject({ firstName: 'Maja', lastName: 'Lind', source: 'linkedin', organizationName: 'Acme' });
    expect(page.headers['cache-control']).toBe('no-store');

    expect((await anonymous('POST', `/api/v1/public/sourcing-notice/${tokenOf(notice.body.data!.url)}/object`)).statusCode).toBe(200);
    expect((await w.owner.get<Contact[]>(`/api/v1/jobs/${w.job.id}/sourced-contacts`)).body.data).toEqual([]);
    const again = await w.owner.post<Added[]>(`/api/v1/jobs/${w.job.id}/sourced-contacts`, { contacts: [maja] });
    expect(again.body.data!.map((r) => r.outcome)).toEqual(['objected']);
    const audit = (await w.owner.get<{ action: string; metadata: unknown }[]>('/api/v1/audit-log?limit=50')).body.data!;
    expect(audit.map((e) => e.action)).toEqual(expect.arrayContaining(['sourced_contact.added', 'sourced_contact.objected']));
    expect(JSON.stringify(audit)).not.toContain('Lind');
  });

  it('leaves the notice email off until an owner turns it on; a recruiter may not', async () => {
    const w = await createWorld(t);
    expect((await w.owner.get<{ noticeByEmail: boolean }>('/api/v1/settings/sourcing')).body.data).toEqual({ noticeByEmail: false });
    const recruiter = await w.member('recruiter');
    expect((await recruiter.put('/api/v1/settings/sourcing', { noticeByEmail: true })).status).toBe(403);
    expect((await w.owner.put<{ noticeByEmail: boolean }>('/api/v1/settings/sourcing', { noticeByEmail: true })).body.data).toEqual({ noticeByEmail: true });
  });

  it('is refused without sourcing:manage, invisible to another organization, and validates what it gets', async () => {
    const w = await createWorld(t);
    const interviewer = await w.member('interviewer');
    expect((await interviewer.post(`/api/v1/jobs/${w.job.id}/sourced-contacts`, { contacts: [maja] })).status).toBe(403);
    const stranger = await createWorld(t, 'Other');
    expect((await stranger.owner.post(`/api/v1/jobs/${w.job.id}/sourced-contacts`, { contacts: [maja] })).status).toBe(404);
    expect((await w.owner.post(`/api/v1/jobs/${w.job.id}/sourced-contacts`, { contacts: [{ ...maja, score: 9 }] })).status).toBe(422);
    expect((await w.owner.post(`/api/v1/jobs/${w.job.id}/sourced-contacts`, { contacts: [{ ...maja, profileUrl: 'javascript:alert(1)' }] })).status).toBe(422);
    const [added] = (await w.owner.post<Added[]>(`/api/v1/jobs/${w.job.id}/sourced-contacts`, { contacts: [maja] })).body.data!;
    expect((await stranger.owner.delete(`/api/v1/sourced-contacts/${added!.contactId}`)).status).toBe(404);
    expect((await w.owner.delete(`/api/v1/sourced-contacts/${added!.contactId}?doNotContact=true`)).status).toBe(200);
  });
});

describe('LinkedIn through the extension', () => {
  const profile = { profileUrl: 'https://www.linkedin.com/in/maja-lind-42/', fullName: 'Maja Lind', headline: 'Backend engineer', location: 'Stockholm, Sweden', text: 'Go and Kubernetes at Spotify. Write to maja.lind@example.com' };

  it('is off until an owner turns it on, needs each person to accept the risk, and seals what was read', async () => {
    const w = await createWorld(t);
    const body = { jobId: w.job.id, keywords: ['Kubernetes'], location: 'Stockholm', profiles: [profile] };
    expect((await w.owner.get<{ enabled: boolean; accepted: boolean }>('/api/v1/sourcing/linkedin/status')).body.data).toMatchObject({ enabled: false, accepted: false });
    expect((await w.owner.post('/api/v1/sourcing/linkedin/results', body)).status).toBe(409);
    expect((await w.owner.put('/api/v1/settings/linkedin-sourcing', { enabled: true, maxProfilesPerRun: 10 })).status).toBe(200);
    expect((await w.owner.post('/api/v1/sourcing/linkedin/results', body)).status).toBe(409);
    const { textVersion } = (await w.owner.get<{ textVersion: number }>('/api/v1/sourcing/linkedin/status')).body.data!;
    expect((await w.owner.post('/api/v1/sourcing/linkedin/accept', { textVersion })).status).toBe(200);

    const sealed = await w.owner.post<{ order: string; people: { ref: string; firstName: string; status: string; evidence: { criterion: string }[] }[] }>('/api/v1/sourcing/linkedin/results', body);
    expect(sealed.status).toBe(200);
    const text = JSON.stringify(sealed.body.data);
    for (const secret of ['Lind', 'maja-lind-42', 'linkedin.com', 'maja.lind@example.com']) expect(text).not.toContain(secret);
    expect(sealed.body.data).toMatchObject({ order: expect.stringContaining('not a ranking'), people: [{ status: 'new', evidence: [{ criterion: 'Kubernetes' }, { criterion: 'Stockholm' }] }] });
    expect((await w.owner.post('/api/v1/sourcing/linkedin/results', { ...body, profiles: Array.from({ length: 11 }, () => profile) })).status).toBe(422);

    const recruiter = await w.member('recruiter');
    expect((await recruiter.put('/api/v1/settings/linkedin-sourcing', { enabled: false, maxProfilesPerRun: 10 })).status).toBe(403);
    expect((await recruiter.post('/api/v1/sourcing/linkedin/results', body)).status).toBe(409);
  });
});
