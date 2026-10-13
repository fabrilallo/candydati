import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { publishJob } from './testing/candidate-world.js';
import { applyAs, auditMentions, createWorld, leftovers, uniquePerson } from './testing/privacy-world.js';
import { createTestApp, type TestApp } from './testing/test-app.js';

let t: TestApp;
beforeAll(async () => {
  t = await createTestApp();
});
afterAll(async () => {
  await t.close();
});

const fullName = (p: { firstName: string; lastName: string }) => `${p.firstName} ${p.lastName}`;
const cvKeys = () => t.files.keys().filter((k) => k.endsWith('/cv'));

describe('erasing a candidate through HTTP', () => {
  it('leaves no row with the ids, email or name in any table except audit_log (ids only) and the candidate.erased event, and no CV in storage', async () => {
    const w = await createWorld(t);
    const second = await publishJob(w.owner, 'Frontend Developer');
    const person = uniquePerson();
    const first = await applyAs(w, person);
    const other = await applyAs(w, person, second.id, second);
    expect(other.candidateId).toBe(first.candidateId);
    const bystander = await applyAs(w);

    expect((await w.owner.post(`/api/v1/candidates/${first.candidateId}/notes`, { body: `Parla con ${person.firstName}, ${person.email}` })).status).toBe(201);
    expect((await w.owner.post('/api/v1/messages', { applicationIds: [first.applicationId], subject: 'Ciao', body: `Gentile ${person.lastName}` })).status).toBe(200);
    const keysBefore = cvKeys().length;

    const needles = [first.candidateId, first.applicationId, other.applicationId, person.email, person.firstName, person.lastName];
    expect(Object.keys(await leftovers(t, needles)).length).toBeGreaterThan(5);

    const erased = await w.owner.post(`/api/v1/candidates/${first.candidateId}/erase`, { confirmName: fullName(person) });
    expect(erased.status).toBe(200);
    expect(erased.body.data).toEqual({ erased: true });

    expect(await leftovers(t, needles)).toEqual({ outbox_event: 1 });
    const { rows: events } = await t.handle.pool.query(`select type, data from outbox_event where data::text ilike $1`, [`%${first.candidateId}%`]);
    expect(events).toEqual([{ type: 'candidate.erased', data: { candidateId: first.candidateId, applicationCount: 2, candidateErased: true } }]);
    expect(await auditMentions(t, [person.email, person.firstName, person.lastName])).toBe(0);
    const { rows: audit } = await t.handle.pool.query(`select action, target_id, metadata from audit_log where action = 'candidate.erased' and target_id = $1`, [first.candidateId]);
    expect(audit).toEqual([{ action: 'candidate.erased', target_id: first.candidateId, metadata: { reason: 'request', applicationCount: 2 } }]);

    expect(cvKeys()).toHaveLength(keysBefore - 2);
    expect(t.files.keys().some((k) => k.includes(first.applicationId) || k.includes(other.applicationId))).toBe(false);
    expect((await w.owner.get(`/api/v1/candidates/${first.candidateId}`)).status).toBe(404);
    // The other candidate of the organization is untouched.
    expect((await w.owner.get(`/api/v1/candidates/${bystander.candidateId}`)).status).toBe(200);
    expect(Object.keys(await leftovers(t, [bystander.candidateId, bystander.person.email]))).toContain('application');
  });

  it('erases one application of a candidate with two and keeps the candidate and the other application', async () => {
    const w = await createWorld(t);
    const second = await publishJob(w.owner, 'Data Engineer');
    const person = uniquePerson();
    const a = await applyAs(w, person);
    const b = await applyAs(w, person, second.id, second);

    const reply = await w.owner.post(`/api/v1/applications/${a.applicationId}/erase`, { confirmName: fullName(person) });
    expect(reply.body.data).toEqual({ erased: true });
    expect(await leftovers(t, [a.applicationId])).toEqual({});
    expect(Object.keys(await leftovers(t, [b.applicationId]))).toContain('application');
    const detail = await w.owner.get<{ candidate: { id: string }; applications: { id: string }[] }>(`/api/v1/candidates/${a.candidateId}`);
    expect(detail.body.data!.applications.map((x) => x.id)).toEqual([b.applicationId]);
    expect(t.files.keys().some((k) => k.includes(a.applicationId))).toBe(false);
    expect(t.files.keys().some((k) => k.includes(b.applicationId))).toBe(true);
    const { rows } = await t.handle.pool.query(`select metadata from audit_log where action = 'candidate.erased' and target_id = $1`, [a.candidateId]);
    expect(rows).toEqual([{ metadata: { reason: 'request', applicationCount: 1 } }]);
  });

  it('refuses a confirmation that is not the full name (422) and deletes nothing', async () => {
    const w = await createWorld(t);
    const x = await applyAs(w);
    for (const confirmName of ['', x.person.firstName, 'Someone Else']) {
      const reply = await w.owner.post(`/api/v1/candidates/${x.candidateId}/erase`, { confirmName });
      expect(reply.status).toBe(422);
    }
    expect((await w.owner.post(`/api/v1/applications/${x.applicationId}/erase`, {})).status).toBe(422);
    expect((await w.owner.get(`/api/v1/candidates/${x.candidateId}`)).status).toBe(200);
    // Case and spacing do not matter.
    const ok = await w.owner.post(`/api/v1/candidates/${x.candidateId}/erase`, { confirmName: `  ${fullName(x.person).toUpperCase()} ` });
    expect(ok.status).toBe(200);
  });

  it('is allowed to owner, admin and recruiter only', async () => {
    const w = await createWorld(t);
    const target = await applyAs(w);
    const body = { confirmName: fullName(target.person) };
    for (const role of ['hiring_manager', 'interviewer']) {
      const user = await w.member(role);
      expect((await user.post(`/api/v1/candidates/${target.candidateId}/erase`, body)).status).toBe(403);
      expect((await user.post(`/api/v1/applications/${target.applicationId}/erase`, body)).status).toBe(403);
    }
    expect((await (await w.member('recruiter')).post(`/api/v1/candidates/${target.candidateId}/erase`, body)).status).toBe(200);
    const again = await applyAs(w);
    expect((await (await w.member('admin')).post(`/api/v1/candidates/${again.candidateId}/erase`, { confirmName: fullName(again.person) })).status).toBe(200);
    const third = await applyAs(w);
    expect((await w.owner.post(`/api/v1/candidates/${third.candidateId}/erase`, { confirmName: fullName(third.person) })).status).toBe(200);
  });

  it('does not reach another organization: 404 and nothing deleted', async () => {
    const mine = await createWorld(t);
    const theirs = await createWorld(t, 'Other Org');
    const victim = await applyAs(theirs);
    const reply = await mine.owner.post(`/api/v1/candidates/${victim.candidateId}/erase`, { confirmName: fullName(victim.person) });
    expect(reply.status).toBe(404);
    expect((await mine.owner.post(`/api/v1/applications/${victim.applicationId}/erase`, { confirmName: fullName(victim.person) })).status).toBe(404);
    expect((await mine.owner.get(`/api/v1/candidates/${victim.candidateId}/export`)).status).toBe(404);
    expect((await mine.owner.patch(`/api/v1/candidates/${victim.candidateId}/details`, { firstName: 'Hacked' })).status).toBe(404);
    expect((await mine.owner.post(`/api/v1/applications/${victim.applicationId}/withdraw-consent`, { scope: 'selection' })).status).toBe(404);
    expect((await theirs.owner.get(`/api/v1/candidates/${victim.candidateId}`)).status).toBe(200);
  });

  it('requires a session', async () => {
    const reply = await t.app.inject({ method: 'POST', url: '/api/v1/candidates/x/erase', headers: { origin: 'http://localhost:3000' }, payload: { confirmName: 'x' } });
    expect(reply.statusCode).toBe(401);
  });
});
