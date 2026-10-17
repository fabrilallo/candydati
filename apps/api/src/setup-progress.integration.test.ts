import type { SetupProgressDto } from '@candydati/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TestUser } from './testing/client.js';
import { createTestApp, uniqueEmail, type TestApp } from './testing/test-app.js';

let t: TestApp;
beforeAll(async () => {
  t = await createTestApp();
});
afterAll(async () => {
  await t.close();
});

const progressOf = async (user: TestUser) => (await user.get<SetupProgressDto>('/api/v1/setup-progress')).body.data!;

describe('GET /api/v1/setup-progress', () => {
  it('starts with nothing done, then ticks the team once someone joins, for the organization of the caller', async () => {
    const owner = await new TestUser(t.app, uniqueEmail('setup-owner'), 'Owner').signUp();
    await owner.createOrganization('Setup Co');
    expect(await progressOf(owner)).toEqual({ privacyNotice: false, careersPage: false, jobCreated: false, jobPublished: false, team: false });
    const colleague = await new TestUser(t.app, uniqueEmail('setup-colleague'), 'Colleague').signUp();
    await colleague.joinAs(owner, 'interviewer');
    expect((await progressOf(owner)).team).toBe(true);
    expect((await progressOf(colleague)).team).toBe(true);
  });

  it('needs a session', async () => {
    expect((await t.app.inject({ method: 'GET', url: '/api/v1/setup-progress' })).statusCode).toBe(401);
  });
});
