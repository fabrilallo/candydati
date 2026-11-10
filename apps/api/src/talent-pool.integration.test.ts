import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createWorld, personForm, publishJob } from './testing/candidate-world.js';
import { createTestApp, uniqueEmail, type TestApp } from './testing/test-app.js';

let t: TestApp;
beforeAll(async () => {
  t = await createTestApp();
});
afterAll(async () => {
  await t.close();
});

const searchOf = (jobId: string) => `/api/v1/jobs/${jobId}/talent-pool/search`;

describe('talent pool search of a job', () => {
  it('searches only the people whose consent covers future positions, and says how many CVs nobody could check', async () => {
    const w = await createWorld(t);
    const other = await publishJob(w.owner, 'Data Engineer');
    expect((await w.submit(personForm({ email: uniqueEmail('pool'), consentScopes: ['selection', 'talent_pool'] }), { job: other })).statusCode).toBe(201);
    expect((await w.submit(personForm({ email: uniqueEmail('only'), consentScopes: ['selection'] }), { job: other })).statusCode).toBe(201);
    const body = { criteria: { keywords: ['Kubernetes'] } };
    const found = await w.owner.post<{ order: string; total: number; notEvaluable: number; people: unknown[] }>(searchOf(w.job.id), body);
    expect(found.status).toBe(200);
    expect(found.body.data).toMatchObject({ order: expect.stringContaining('not a ranking'), total: 0, notEvaluable: 1, people: [] });
  });

  it('validates the criteria and hides the job from people outside its team', async () => {
    const w = await createWorld(t);
    expect((await w.owner.post(searchOf(w.job.id), { criteria: {} })).status).toBe(422);
    expect((await w.owner.post(searchOf(w.job.id), { criteria: { keywords: ['donna'] } })).status).toBe(422);
    // Someone outside the job's team does not even learn that the job exists.
    const interviewer = await w.member('interviewer');
    expect((await interviewer.post(searchOf(w.job.id), { criteria: { keywords: ['Go'] } })).status).toBe(404);
  });
});
