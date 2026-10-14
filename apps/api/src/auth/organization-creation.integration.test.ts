import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TestUser } from '../testing/client.js';
import { createTestApp, uniqueEmail, type TestApp } from '../testing/test-app.js';

let t: TestApp;
beforeAll(async () => {
  t = await createTestApp({ env: { ORGANIZATION_CREATION: 'one_per_user' } });
});
afterAll(async () => {
  await t.close();
});

describe('organization creation is restricted (L2)', () => {
  it('one_per_user: a second organization is refused with Better Auth code', async () => {
    const user = await new TestUser(t.app, uniqueEmail('one-org'), 'One').signUp();
    await user.createOrganization('First Org');
    const second = await user.post('/api/auth/organization/create', { name: 'Second', slug: `second-${Date.now()}` });
    expect(second.status).toBe(403);
    expect(second.body).toMatchObject({ code: 'YOU_ARE_NOT_ALLOWED_TO_CREATE_A_NEW_ORGANIZATION' });
  });
});
