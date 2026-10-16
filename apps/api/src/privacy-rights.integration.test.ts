import { candidateExportSchema } from '@candydati/domain';
import { fakePdfBytes } from '@candydati/core/testing';
import { strFromU8, unzipSync } from 'fflate';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { applyAs, auditMentions, createWorld, uniquePerson } from './testing/privacy-world.js';
import { personForm } from './testing/candidate-world.js';
import { createTestApp, type TestApp } from './testing/test-app.js';

interface Detail {
  candidate: { id: string; firstName: string; lastName: string; email: string; phone: string | null; linkedinUrl: string | null; talentPool: boolean; retentionExpiresAt: string };
  applications: { id: string; consent: { scopes: string[] }; retentionExpiresAt: string }[];
}

let t: TestApp;
beforeAll(async () => {
  t = await createTestApp();
});
afterAll(async () => {
  await t.close();
});

describe('export of one candidate', () => {
  it('downloads a ZIP with candidate.json in the public schema and the original CV, never cached', async () => {
    const w = await createWorld(t);
    const x = await applyAs(w);
    await w.owner.post(`/api/v1/candidates/${x.candidateId}/notes`, { body: 'Ottimo colloquio' });
    const response = await w.owner.download(`/api/v1/candidates/${x.candidateId}/export`);
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toBe('application/zip');
    expect(response.headers['cache-control']).toBe('private, no-store');
    expect(response.headers['content-disposition']).toMatch(/^attachment; filename="candidate-[^"]+\.zip"; filename\*=UTF-8''candidate-/);
    expect(response.headers['x-content-type-options']).toBe('nosniff');

    const entries = unzipSync(new Uint8Array(response.rawPayload));
    expect(Object.keys(entries).sort()).toEqual(['candidate.json', `files/${x.applicationId}/Giulia Bianchi.pdf`]);
    const json = candidateExportSchema.parse(JSON.parse(strFromU8(entries['candidate.json']!)));
    expect(json.candidate).toMatchObject({ id: x.candidateId, email: x.person.email });
    expect(json.applications).toHaveLength(1);
    expect(json.applications[0]!.cv?.path).toBe(`files/${x.applicationId}/Giulia Bianchi.pdf`);
    expect(json.notes.map((n) => n.body)).toEqual(['Ottimo colloquio']);
    expect([...entries[`files/${x.applicationId}/Giulia Bianchi.pdf`]!]).toEqual([...fakePdfBytes()]);

    const { rows } = await t.handle.pool.query(`select metadata from audit_log where action = 'candidate.exported' and target_id = $1`, [x.candidateId]);
    expect(rows).toEqual([{ metadata: { applicationCount: 1, fileCount: 1, missingFileCount: 0 } }]);
    expect(await auditMentions(t, [x.person.email, x.person.lastName])).toBe(0);
  });

  it('is allowed to owner, admin and recruiter only', async () => {
    const w = await createWorld(t);
    const x = await applyAs(w);
    const url = `/api/v1/candidates/${x.candidateId}/export`;
    for (const role of ['hiring_manager', 'interviewer']) expect((await (await w.member(role)).get(url)).status).toBe(403);
    for (const role of ['admin', 'recruiter']) expect((await (await w.member(role)).download(url)).statusCode).toBe(200);
    expect((await w.owner.download(url)).statusCode).toBe(200);
    expect((await w.owner.get('/api/v1/candidates/nope/export')).status).toBe(404);
  });
});

describe('correction', () => {
  it('changes name, email, phone and LinkedIn and audits the field names only', async () => {
    const w = await createWorld(t);
    const x = await applyAs(w);
    const next = uniquePerson();
    const reply = await w.owner.patch<Detail>(`/api/v1/candidates/${x.candidateId}/details`, { firstName: next.firstName, email: next.email.toUpperCase(), phone: '+39 333 1234567', linkedinUrl: 'https://www.linkedin.com/in/qualcuno' });
    expect(reply.status).toBe(200);
    expect(reply.body.data!.candidate).toMatchObject({ id: x.candidateId, firstName: next.firstName, lastName: x.person.lastName, phone: '+39 333 1234567' });
    expect(reply.body.data!.candidate.email.toLowerCase()).toBe(next.email.toLowerCase());
    const { rows } = await t.handle.pool.query<{ metadata: { fields: string[] } }>(`select metadata from audit_log where action = 'candidate.corrected' and target_id = $1`, [x.candidateId]);
    expect(rows.map((r) => r.metadata.fields.slice().sort())).toEqual([['email', 'firstName', 'linkedinUrl', 'phone']]);
    expect(await auditMentions(t, [next.firstName, next.email, '1234567'])).toBe(0);
  });

  it('answers 409 when the email belongs to another candidate and changes nothing', async () => {
    const w = await createWorld(t);
    const a = await applyAs(w);
    const b = await applyAs(w);
    const reply = await w.owner.patch(`/api/v1/candidates/${a.candidateId}/details`, { email: b.person.email, firstName: 'Changed' });
    expect(reply.status).toBe(409);
    const detail = await w.owner.get<Detail>(`/api/v1/candidates/${a.candidateId}`);
    expect(detail.body.data!.candidate).toMatchObject({ email: a.person.email, firstName: a.person.firstName });
  });

  it('validates the body (422), and is refused to an interviewer', async () => {
    const w = await createWorld(t);
    const x = await applyAs(w);
    const url = `/api/v1/candidates/${x.candidateId}/details`;
    expect((await w.owner.patch(url, { email: 'not-an-email' })).status).toBe(422);
    expect((await w.owner.patch(url, { id: 'other', organizationId: 'org' })).status).toBeLessThan(500);
    expect((await (await w.member('interviewer')).patch(url, { firstName: 'X' })).status).toBe(403);
    expect((await (await w.member('recruiter')).patch(url, { phone: '+39 02 1234567' })).status).toBe(200);
  });
});

describe('withdrawal of consent', () => {
  it('talent_pool: leaves the pool and falls back to the selection retention, keeping the application', async () => {
    const w = await createWorld(t);
    const person = uniquePerson();
    const reply = await w.submit(personForm({ ...person, consentScopes: ['selection', 'talent_pool'] }));
    expect(reply.statusCode).toBe(201);
    const found = await w.owner.get<{ id: string; candidate: { id: string } }[]>(`/api/v1/candidates?query=${person.lastName}`);
    const candidateId = found.body.data![0]!.id;
    const before = (await w.owner.get<Detail>(`/api/v1/candidates/${candidateId}`)).body.data!;
    expect(before.candidate.talentPool).toBe(true);
    const application = before.applications[0]!;
    expect(application.consent.scopes).toContain('talent_pool');

    const withdrawn = await w.owner.post<Detail & { erased?: boolean }>(`/api/v1/applications/${application.id}/withdraw-consent`, { scope: 'talent_pool' });
    expect(withdrawn.status).toBe(200);
    expect(withdrawn.body.data!.candidate.talentPool).toBe(false);
    expect(withdrawn.body.data!.applications[0]!.consent.scopes).toEqual(['selection']);
    expect(new Date(withdrawn.body.data!.applications[0]!.retentionExpiresAt).getTime()).toBeLessThan(new Date(application.retentionExpiresAt).getTime());
  });

  it('selection: erases that application with reason consent_withdrawn', async () => {
    const w = await createWorld(t);
    const x = await applyAs(w);
    const reply = await w.owner.post(`/api/v1/applications/${x.applicationId}/withdraw-consent`, { scope: 'selection' });
    expect(reply.body.data).toEqual({ erased: true });
    expect((await w.owner.get(`/api/v1/candidates/${x.candidateId}`)).status).toBe(404);
    expect(t.files.keys().some((k) => k.includes(x.applicationId))).toBe(false);
    const { rows } = await t.handle.pool.query(`select metadata from audit_log where action = 'candidate.erased' and target_id = $1`, [x.candidateId]);
    expect(rows).toEqual([{ metadata: { reason: 'consent_withdrawn', applicationCount: 1 } }]);
  });

  it('refuses an unknown scope (422) and a role without candidate:update (403)', async () => {
    const w = await createWorld(t);
    const x = await applyAs(w);
    const url = `/api/v1/applications/${x.applicationId}/withdraw-consent`;
    expect((await w.owner.post(url, { scope: 'everything' })).status).toBe(422);
    expect((await (await w.member('interviewer')).post(url, { scope: 'selection' })).status).toBe(403);
    expect((await w.owner.get(`/api/v1/candidates/${x.candidateId}`)).status).toBe(200);
  });
});
