import { completeJobContent } from '@candydati/core/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createWorld, personForm } from './testing/candidate-world.js';
import { drainAutomations } from './testing/phase4.js';
import { createTestApp, uniqueEmail, type TestApp } from './testing/test-app.js';

interface Pack { id: string; name: string; ruleCount: number; templateIds: string[] }
interface Rule { id: string; stageId: string; packId: string | null; action: { type: string; toStageId?: string }; createdBy: string }
interface Job { id: string; content: { process: { id: string; type: string }[] } }

let t: TestApp;
beforeAll(async () => {
  t = await createTestApp();
});
afterAll(async () => {
  await t.close();
});

describe('automation packs', () => {
  it('kept once, brought by a template, copied into each job as its creator’s rules, and they run', async () => {
    const w = await createWorld(t);
    const pack = (await w.owner.post<Pack>('/api/v1/automation-packs', { name: 'Tech hiring' })).body.data!;
    expect((await w.owner.post('/api/v1/automation-packs', { name: 'tech HIRING' })).status).toBe(409);
    expect((await w.owner.post(`/api/v1/automation-packs/${pack.id}/rules`, { stage: 'received', action: { type: 'add_tag', tag: 'from-pack' } })).status).toBe(201);
    expect((await w.owner.post(`/api/v1/automation-packs/${pack.id}/rules`, { stage: 'hr_interview', action: { type: 'propose_move', toStageId: 'technical_interview' } })).status).toBe(201);
    expect((await w.owner.post(`/api/v1/automation-packs/${pack.id}/rules`, { stage: 'stage-0', action: { type: 'request_feedback' } })).status).toBe(422);

    const template = (await w.owner.post<{ id: string }>('/api/v1/job-templates', { name: 'Backend', content: completeJobContent() })).body.data!;
    expect((await w.owner.put(`/api/v1/job-templates/${template.id}/automation-packs`, { packIds: [pack.id] })).status).toBe(200);
    expect((await w.owner.get<Pack[]>('/api/v1/automation-packs')).body.data).toEqual([expect.objectContaining({ id: pack.id, ruleCount: 2, templateIds: [template.id] })]);

    const job = (await w.owner.post<Job>('/api/v1/jobs', { templateId: template.id, content: {} })).body.data!;
    const [hr, tech] = job.content.process;
    const rules = (await w.owner.get<Rule[]>(`/api/v1/jobs/${job.id}/automations`)).body.data!;
    expect(rules.map((r) => [r.stageId, r.action.type, r.action.toStageId ?? null, r.packId])).toEqual([
      ['received', 'add_tag', null, pack.id],
      [hr!.id, 'propose_move', tech!.id, pack.id],
    ]);

    const again = await w.owner.post<{ created: string[]; updated: string[]; skipped: unknown[] }>(`/api/v1/jobs/${job.id}/automation-packs`, { packId: pack.id });
    expect(again.status).toBe(201);
    expect(again.body.data!).toMatchObject({ created: [], updated: rules.map((r) => r.id) });
    expect((await w.owner.get<Rule[]>(`/api/v1/jobs/${job.id}/automations`)).body.data).toHaveLength(2);

    await w.owner.post(`/api/v1/jobs/${w.job.id}/automation-packs`, { packId: pack.id });
    expect((await w.submit(personForm({ firstName: 'Giulia', email: uniqueEmail('pack') }))).statusCode).toBe(201);
    await drainAutomations(t);
    expect((await w.owner.get<{ tags: string[] }[]>('/api/v1/candidates?tag=from-pack')).body.data).toHaveLength(1);
  });

  it('is refused to people who do not manage automations and invisible to another organization', async () => {
    const w = await createWorld(t);
    const pack = (await w.owner.post<Pack>('/api/v1/automation-packs', { name: 'Private' })).body.data!;
    const interviewer = await w.member('interviewer');
    expect((await interviewer.get('/api/v1/automation-packs')).status).toBe(403);
    expect((await interviewer.post(`/api/v1/jobs/${w.job.id}/automation-packs`, { packId: pack.id })).status).toBe(403);
    const stranger = await createWorld(t, 'Other');
    expect((await stranger.owner.get<Pack[]>('/api/v1/automation-packs')).body.data).toEqual([]);
    expect((await stranger.owner.post(`/api/v1/jobs/${stranger.job.id}/automation-packs`, { packId: pack.id })).status).toBe(404);
    expect((await stranger.owner.delete(`/api/v1/automation-packs/${pack.id}`)).status).toBe(404);
    expect((await w.owner.delete(`/api/v1/automation-packs/${pack.id}`)).status).toBe(200);
  });
});
