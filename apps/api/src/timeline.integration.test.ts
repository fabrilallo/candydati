import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createWorld, personForm, type World } from './testing/candidate-world.js';
import { createTestApp, uniqueEmail, type TestApp } from './testing/test-app.js';

interface Item { id: string; kind: string; at: string; actor: { type: string; name: string | null } | null; fromPreviousSystem: boolean; [key: string]: unknown }
interface Timeline { items: Item[] }
interface Pipeline { stages: { id: string }[]; applications: { id: string; stageId: string; candidate: { id: string } }[] }

let t: TestApp;
beforeAll(async () => {
  t = await createTestApp();
});
afterAll(async () => {
  await t.close();
});

const apply = async (w: World) => {
  expect((await w.submit(personForm({ email: uniqueEmail('candidate') }))).statusCode).toBe(201);
  const board = (await w.owner.get<Pipeline>(`/api/v1/jobs/${w.job.id}/pipeline`)).body.data!;
  return { card: board.applications[0]!, stages: board.stages.map((s) => s.id) };
};

describe('GET /applications/:id/timeline', () => {
  it('tells the story oldest first: received, a move, a note, a message and the outcome', async () => {
    const w = await createWorld(t);
    const { card, stages } = await apply(w);
    await w.owner.post(`/api/v1/applications/${card.id}/move`, { stageId: stages[1] });
    await w.owner.post(`/api/v1/candidates/${card.candidate.id}/notes`, { body: 'Colloquio positivo', applicationId: card.id });
    await w.owner.post('/api/v1/messages', { applicationIds: [card.id], subject: 'Ciao', body: 'Testo' });
    await w.owner.post(`/api/v1/applications/${card.id}/decide`, { outcome: 'hired' });

    const res = await w.owner.get<Timeline>(`/api/v1/applications/${card.id}/timeline`);
    expect(res.status).toBe(200);
    const items = res.body.data!.items;
    expect(items[0]).toMatchObject({ kind: 'received', source: 'careers_page', stageId: 'received', actor: { type: 'candidate' } });
    expect(items.at(-1)).toMatchObject({ kind: 'decided', outcome: 'hired' });
    const kinds = items.map((i) => i.kind);
    expect(kinds).toEqual(expect.arrayContaining(['stage_moved', 'note', 'message']));
    expect(items.find((i) => i.kind === 'stage_moved')).toMatchObject({ fromStageId: 'received', toStageId: stages[1], fromPreviousSystem: false });
    expect(items.find((i) => i.kind === 'note')).toMatchObject({ excerpt: 'Colloquio positivo', actor: { type: 'person' } });
    expect(items.map((i) => i.at)).toEqual([...items.map((i) => i.at)].sort());
    expect(JSON.stringify(items)).not.toMatch(/score|rating|recommendation/);
  });

  it('keeps organizations apart and needs a session', async () => {
    const a = await createWorld(t, 'Alpha');
    const b = await createWorld(t, 'Beta');
    const { card } = await apply(a);
    expect((await b.owner.get(`/api/v1/applications/${card.id}/timeline`)).status).toBe(404);
    expect((await t.app.inject({ method: 'GET', url: `/api/v1/applications/${card.id}/timeline` })).statusCode).toBe(401);
  });

  it('follows the team of the job: a person outside it gets 404, a member reads it', async () => {
    const w = await createWorld(t);
    const { card } = await apply(w);
    const hm = await w.member('hiring_manager');
    expect((await hm.get(`/api/v1/applications/${card.id}/timeline`)).status).toBe(404);
    await w.joinTeam(hm, 'hiring_manager');
    expect((await hm.get<Timeline>(`/api/v1/applications/${card.id}/timeline`)).body.data!.items[0]?.kind).toBe('received');
  });
});
