import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createWorld } from './testing/candidate-world.js';
import { createTestApp, uniqueEmail, type TestApp } from './testing/test-app.js';

interface Stage {
  id: string;
  type: string;
  title?: string;
}
interface Duplicated {
  job: { id: string; content: { process: Stage[] } };
  stageId: string;
  copied: string[];
  skipped: string[];
}
interface Failure {
  error: { code: string; issues?: { path: string; message: string }[] } | null;
}

let t: TestApp;
beforeAll(async () => {
  t = await createTestApp();
});
afterAll(async () => {
  await t.close();
});

describe('POST /api/v1/jobs/:id/stages/:stageId/duplicate', () => {
  it('inserts the copy after the source with its configuration, skipping what the person may not manage, always restricted like its source, and audits it', async () => {
    const w = await createWorld(t);
    const jobUrl = `/api/v1/jobs/${w.job.id}`;
    const [first, second] = (await w.owner.get<{ content: { process: Stage[] } }>(jobUrl)).body.data!.content.process;
    await w.owner.put(`${jobUrl}/interviewers`, { stages: [{ stageId: first!.id, interviewers: [{ kind: 'external', name: 'Eva External', email: uniqueEmail('eva') }] }] });
    await w.owner.put(`${jobUrl}/scorecard`, { criteria: [{ label: 'Postgres', stageId: first!.id }] });
    expect((await w.owner.post(`${jobUrl}/automations`, { stageId: first!.id, action: { type: 'create_task', title: 'Prepare' } })).status).toBe(201);
    expect((await w.owner.put(`${jobUrl}/stages/${first!.id}/restriction`, { restricted: true })).status).toBe(200);

    const manager = await w.member('hiring_manager');
    await w.joinTeam(manager, 'interviewer');
    const response = await manager.post<Duplicated>(`${jobUrl}/stages/${first!.id}/duplicate`);
    expect(response.status).toBe(200);
    const result = response.body.data!;
    expect(result.job.content.process.map((s) => s.id)).toEqual([first!.id, result.stageId, second!.id]);
    expect(result.copied).toEqual(['interviewers', 'scorecard', 'restriction']);
    expect(result.skipped).toEqual(['automations']);

    const interviewers = (await w.owner.get<{ stageId: string; interviewers: { name: string }[] }[]>(`${jobUrl}/interviewers`)).body.data!;
    expect(interviewers.find((s) => s.stageId === result.stageId)?.interviewers.map((i) => i.name)).toEqual(['Eva External']);
    const rules = (await w.owner.get<{ stageId: string }[]>(`${jobUrl}/automations`)).body.data!;
    expect(rules.filter((rule) => rule.stageId === result.stageId)).toEqual([]);
    const restricted = (await w.owner.get<{ stageIds: string[] }>(`${jobUrl}/restricted-stages`)).body.data!;
    // Restricted for everyone, although this hiring manager does not decide who reads what on this job.
    expect(restricted.stageIds.toSorted()).toEqual([first!.id, result.stageId].toSorted());

    const audit = (await w.owner.get<{ action: string; metadata: Record<string, unknown> }[]>('/api/v1/audit-log?limit=50')).body.data!;
    expect(audit.find((event) => event.action === 'job.stage_duplicated')?.metadata).toEqual({
      sourceStageId: first!.id, stageId: result.stageId, copied: ['interviewers', 'scorecard', 'restriction'], skipped: ['automations'],
    });
  });

  it('answers 422 for an unknown stage, 403 for an interviewer and 404 for a job of another organization', async () => {
    const w = await createWorld(t);
    const other = await createWorld(t, 'Globex');
    const unknown = await w.owner.post<Failure>(`/api/v1/jobs/${w.job.id}/stages/nope/duplicate`);
    expect(unknown.status).toBe(422);
    expect(unknown.body.error?.issues).toEqual([{ path: 'stageId', message: 'unknown_stage' }]);
    const interviewer = await w.member('interviewer');
    expect((await interviewer.post(`/api/v1/jobs/${w.job.id}/stages/nope/duplicate`)).status).toBe(403);
    const [stage] = (await other.owner.get<{ content: { process: Stage[] } }>(`/api/v1/jobs/${other.job.id}`)).body.data!.content.process;
    expect((await w.owner.post(`/api/v1/jobs/${other.job.id}/stages/${stage!.id}/duplicate`)).status).toBe(404);
  });
});
