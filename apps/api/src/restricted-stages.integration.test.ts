import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createKey, withKey } from './testing/api-keys.js';
import { createWorld, personForm } from './testing/candidate-world.js';
import { createTestApp, uniqueEmail, type TestApp } from './testing/test-app.js';

interface Card {
  id: string;
  candidate: { id: string };
}
interface Detail {
  notes: { body: string; restricted: boolean; stageId: string | null }[];
  applications: { restrictedStageIds: string[] }[];
}

let t: TestApp;
beforeAll(async () => {
  t = await createTestApp();
});
afterAll(async () => {
  await t.close();
});

describe('restricted stages over HTTP (PRODUCT.md §6.2)', () => {
  it('hides the notes of a restricted stage from the rest of the team and audits the mark; keys cannot change it', async () => {
    const w = await createWorld(t);
    await w.submit(personForm({ email: uniqueEmail('anna') }));
    const board = (await w.owner.get<{ stages: { id: string }[]; applications: Card[] }>(`/api/v1/jobs/${w.job.id}/pipeline`)).body.data!;
    const card = board.applications[0]!;
    const stageId = board.stages[1]!.id;
    const [hm, recruiter] = [await w.member('hiring_manager'), await w.member('recruiter')];
    await w.joinTeam(hm, 'hiring_manager');

    expect((await recruiter.put(`/api/v1/jobs/${w.job.id}/stages/${stageId}/restriction`, { restricted: true })).status).toBe(403);
    const marked = await hm.put<{ stageIds: string[]; canManage: boolean }>(`/api/v1/jobs/${w.job.id}/stages/${stageId}/restriction`, { restricted: true });
    expect(marked.body.data).toEqual({ jobId: w.job.id, stageIds: [stageId], canManage: true });
    expect((await recruiter.get<{ stageIds: string[]; canManage: boolean }>(`/api/v1/jobs/${w.job.id}/restricted-stages`)).body.data).toEqual({ jobId: w.job.id, stageIds: [stageId], canManage: false });

    await w.owner.post(`/api/v1/applications/${card.id}/move`, { stageId });
    const note = await hm.post<{ restricted: boolean }>(`/api/v1/candidates/${card.candidate.id}/notes`, { body: 'Compensation talk', applicationId: card.id });
    expect(note.body.data).toMatchObject({ restricted: true, stageId });

    const forOwner = (await w.owner.get<Detail>(`/api/v1/candidates/${card.candidate.id}`)).body.data!;
    expect(forOwner.notes).toEqual([expect.objectContaining({ body: 'Compensation talk', restricted: true })]);
    expect(forOwner.applications[0]?.restrictedStageIds).toEqual([stageId]);
    expect((await recruiter.get<Detail>(`/api/v1/candidates/${card.candidate.id}`)).body.data!.notes).toEqual([]);

    // A key acts like its person: the owner's key reads the note, and still cannot change who reads what.
    const ownerKey = await createKey(w.owner, ['candidate:read', 'job:read']);
    const viaKey = await withKey<Detail>(t.app, ownerKey.secret, 'GET', `/api/v1/candidates/${card.candidate.id}`);
    expect(viaKey.body.data!.notes.map((n) => n.body)).toEqual(['Compensation talk']);
    expect((await withKey(t.app, ownerKey.secret, 'PUT', `/api/v1/jobs/${w.job.id}/stages/${stageId}/restriction`, { body: { restricted: false } })).status).toBe(403);

    const audit = (await w.owner.get<{ action: string }[]>('/api/v1/audit-log?limit=50')).body.data!.map((event) => event.action);
    expect(audit).toContain('job.stage_restricted');
  });
});
