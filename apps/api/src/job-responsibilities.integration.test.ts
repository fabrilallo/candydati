import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TestUser } from './testing/client.js';
import { createTestApp, uniqueEmail, type TestApp } from './testing/test-app.js';

const calls: unknown[] = [];
let on = true;
let t: TestApp;
beforeAll(async () => {
  t = await createTestApp({
    responsibilitySuggester: {
      available: () => on,
      suggest: async (context) => {
        calls.push(context);
        return { responsibilities: ['Progetta le API', 'Rivede il codice', 'Segue il rilascio'] };
      },
    },
  });
});
afterAll(async () => {
  await t.close();
});

const newUser = (label: string) => new TestUser(t.app, uniqueEmail(label), `User ${label}`);
const URL = '/api/v1/jobs/responsibilities/suggest';

describe('POST /jobs/responsibilities/suggest', () => {
  it('proposes lines in the envelope, audits the call and saves nothing', async () => {
    const owner = await newUser('owner').signUp();
    await owner.createOrganization('Acme');
    const res = await owner.post<{ status: string; responsibilities: string[] }>(URL, { title: 'Backend Developer', role: 'backend_developer', language: 'it', existing: ['Scrive codice'] });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true, data: { status: 'proposed', responsibilities: ['Progetta le API', 'Rivede il codice', 'Segue il rilascio'] } });
    expect(calls).toHaveLength(1);
    const log = (await owner.get<{ action: string; metadata: Record<string, unknown> }[]>('/api/v1/audit-log')).body.data!;
    expect(log.find((e) => e.action === 'job.responsibilities_suggested')?.metadata).toMatchObject({ status: 'proposed', count: 3 });
    expect((await owner.get<unknown[]>('/api/v1/jobs')).body.data).toEqual([]);
  });

  it('answers unavailable without a fast model, 422 without title or role, 403 to an interviewer, 401 to anonymous', async () => {
    const owner = await newUser('owner2').signUp();
    await owner.createOrganization('Beta');
    const interviewer = await newUser('int').signUp();
    await interviewer.joinAs(owner, 'interviewer');
    on = false;
    expect((await owner.post<{ status: string }>(URL, { title: 'Dev' })).body.data).toEqual({ status: 'unavailable' });
    on = true;
    expect((await owner.post(URL, {})).status).toBe(422);
    expect((await interviewer.post(URL, { title: 'Dev' })).status).toBe(403);
    expect((await newUser('anon').post(URL, { title: 'Dev' })).status).toBe(401);
  });
});
