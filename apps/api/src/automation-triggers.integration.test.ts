import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createWorld, personForm, type World } from './testing/candidate-world.js';
import { drainAutomations, scanAutomations } from './testing/phase4.js';
import { createTestApp, uniqueEmail, type TestApp } from './testing/test-app.js';

interface Rule { id: string; stageId: string; trigger: { type: string; days?: number }; conditions: Record<string, unknown> }
interface Preview { trigger: string; matching: number; firingNow: number | null; items: { applicationId: string; firstName: string; firesNow: boolean | null }[] | null }
interface Task { title: string }
interface Board { stages: { id: string }[]; applications: { id: string }[] }

const DAY_MS = 86_400_000;
let t: TestApp;
beforeAll(async () => {
  t = await createTestApp();
});
afterAll(async () => {
  await t.close();
});

const board = async (w: World) => (await w.owner.get<Board>(`/api/v1/jobs/${w.job.id}/pipeline`)).body.data!;
async function applyOne(w: World, firstName = 'Giulia'): Promise<string> {
  const before = new Set((await board(w)).applications.map((a) => a.id));
  expect((await w.submit(personForm({ firstName, email: uniqueEmail('cand') }))).statusCode).toBe(201);
  return (await board(w)).applications.map((a) => a.id).find((id) => !before.has(id))!;
}

describe('automation triggers, conditions and preview', () => {
  it('stores a trigger and conditions, and an older client still gets a stage_entered rule', async () => {
    const w = await createWorld(t);
    const url = `/api/v1/jobs/${w.job.id}/automations`;
    const stuck = await w.owner.post<Rule>(url, {
      stageId: 'received',
      trigger: { type: 'stage_stuck', days: 3 },
      conditions: { sources: ['careers_page'], consentScopes: ['selection'] },
      action: { type: 'create_task', title: 'Follow up' },
    });
    expect(stuck.status).toBe(201);
    expect(stuck.body.data).toMatchObject({ trigger: { type: 'stage_stuck', days: 3 }, conditions: { sources: ['careers_page'], consentScopes: ['selection'] } });
    const plain = await w.owner.post<Rule>(url, { stageId: 'received', action: { type: 'create_task', title: 'Read the CV' } });
    expect(plain.body.data).toMatchObject({ trigger: { type: 'stage_entered' }, conditions: {} });
    expect((await w.owner.post(url, { stageId: 'received', trigger: { type: 'stage_stuck', days: 0 }, action: { type: 'create_task', title: 'x' } })).status).toBe(422);
    expect((await w.owner.post(url, { stageId: 'received', trigger: { type: 'ranked' }, action: { type: 'create_task', title: 'x' } })).status).toBe(422);
  });

  it('previews who a rule would act for, read-only, and the scan then acts once for them', async () => {
    const w = await createWorld(t);
    const applicationId = await applyOne(w, 'Marta');
    const previewUrl = `/api/v1/jobs/${w.job.id}/automations/preview`;
    const body = { stageId: 'received', trigger: { type: 'stage_stuck', days: 2 } };

    const now = await w.owner.post<Preview>(previewUrl, body);
    expect(now.status).toBe(200);
    expect(now.body.data).toEqual({ trigger: 'stage_stuck', matching: 1, firingNow: 0, items: [expect.objectContaining({ applicationId, firstName: 'Marta', firesNow: false })] });
    expect((await w.owner.post<Preview>(previewUrl, { ...body, conditions: { sources: ['import'] } })).body.data).toMatchObject({ matching: 0, items: [] });
    expect((await (await w.member('interviewer')).post(previewUrl, body)).status).toBe(403);
    expect((await w.owner.post(previewUrl, { stageId: 'stg-nope' })).status).toBe(422);

    await w.owner.post(`/api/v1/jobs/${w.job.id}/automations`, { ...body, action: { type: 'create_task', title: 'Still waiting' } });
    // Three days go by in the stage (the runner checks again with the real clock).
    await t.handle.pool.query('update application set stage_changed_at = $1 where id = $2', [new Date(Date.now() - 3 * DAY_MS), applicationId]);
    expect((await w.owner.post<Preview>(previewUrl, body)).body.data).toMatchObject({ firingNow: 1 });
    expect((await scanAutomations(t, new Date())).queued).toBeGreaterThanOrEqual(1);
    await drainAutomations(t);
    await scanAutomations(t, new Date());
    await drainAutomations(t);
    const tasks = (await w.owner.get<Task[]>(`/api/v1/applications/${applicationId}/tasks`)).body.data!;
    expect(tasks.map((task) => task.title)).toEqual(['Still waiting']);
  });
});
