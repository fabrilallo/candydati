import { completeJobContent } from '@tt/core/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createWorld, personForm } from './testing/candidate-world.js';
import { createTestApp, type TestApp } from './testing/test-app.js';

interface Stage {
  id?: string;
  title?: string;
  type: string;
}
interface JobBody {
  content: { process: Stage[] };
}
interface Pipeline {
  stages: { id: string; declared: Stage | null; count: number }[];
  applications: { id: string; stageId: string; stageRemoved: boolean }[];
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

describe('stable stage ids on a published job', () => {
  it('blocks removing a stage with open candidates (422 with issues) and allows it once they moved', async () => {
    const w = await createWorld(t);
    const jobUrl = `/api/v1/jobs/${w.job.id}`;
    const job = (await w.owner.get<JobBody>(jobUrl)).body.data!;
    const [first, second] = job.content.process;
    expect(first?.id).toMatch(/^stg-[a-z0-9]+$/);
    expect(second?.id).toMatch(/^stg-[a-z0-9]+$/);

    expect((await w.submit(personForm())).statusCode).toBe(201);
    const board = (await w.owner.get<Pipeline>(`${jobUrl}/pipeline`)).body.data!;
    const card = board.applications[0]!;
    expect(board.stages.map((s) => s.id)).toEqual(['received', first!.id, second!.id]);

    const moved = await w.owner.post(`/api/v1/applications/${card.id}/move`, { stageId: first!.id });
    expect(moved.status).toBe(200);

    const content = (process: Stage[]) => completeJobContent({ title: 'Backend Developer', process: process as never });
    const reordered = await w.owner.put<JobBody>(jobUrl, { content: content([{ ...second!, title: 'Prova tecnica' }, first!]) });
    expect(reordered.status).toBe(200);
    expect(reordered.body.data!.content.process.map((s) => s.id)).toEqual([second!.id, first!.id]);
    const afterReorder = (await w.owner.get<Pipeline>(`${jobUrl}/pipeline`)).body.data!;
    expect(afterReorder.stages.map((s) => [s.id, s.count])).toEqual([['received', 0], [second!.id, 0], [first!.id, 1]]);
    expect(afterReorder.stages[1]?.declared?.title).toBe('Prova tecnica');

    const refused = await w.owner.put<Failure>(jobUrl, { content: content([second!]) });
    expect(refused.status).toBe(422);
    expect(refused.body.error?.code).toBe('validation_failed');
    expect(refused.body.error?.issues).toEqual([{ path: 'process', message: `stage_has_open_applications:${first!.id}` }]);

    expect((await w.owner.post(`/api/v1/applications/${card.id}/move`, { stageId: second!.id })).status).toBe(200);
    const removed = await w.owner.put<JobBody>(jobUrl, { content: content([second!]) });
    expect(removed.status).toBe(200);
    expect(removed.body.data!.content.process.map((s) => s.id)).toEqual([second!.id]);
  });

  it('shows a decided application of a removed stage as stageRemoved, without failing', async () => {
    const w = await createWorld(t);
    const jobUrl = `/api/v1/jobs/${w.job.id}`;
    const [first, second] = (await w.owner.get<JobBody>(jobUrl)).body.data!.content.process;
    await w.submit(personForm());
    const card = (await w.owner.get<Pipeline>(`${jobUrl}/pipeline`)).body.data!.applications[0]!;
    await w.owner.post(`/api/v1/applications/${card.id}/move`, { stageId: first!.id });
    await w.owner.post(`/api/v1/applications/${card.id}/decide`, { outcome: 'not_selected' });
    const removed = await w.owner.put(jobUrl, { content: completeJobContent({ title: 'Backend Developer', process: [second as never] }) });
    expect(removed.status).toBe(200);
    const board = (await w.owner.get<Pipeline>(`${jobUrl}/pipeline`)).body.data!;
    expect(board.applications[0]).toMatchObject({ id: card.id, stageRemoved: true });
  });
});
