import { eq, schema } from '@tt/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TestUser } from '../testing/client.js';
import { createTestApp, uniqueEmail, type TestApp } from '../testing/test-app.js';

const ADMIN_EMAIL = uniqueEmail('instance-admin');
let t: TestApp;
beforeAll(async () => {
  t = await createTestApp({ env: { ORGANIZATION_CREATION: 'one_per_user', INSTANCE_ADMIN_EMAILS: ADMIN_EMAIL } });
});
afterAll(async () => {
  await t.close();
});

const createRequest = (user: TestUser, name: string) => user.post('/api/auth/organization/create', { name, slug: `${name.toLowerCase()}-${Math.random().toString(36).slice(2, 8)}` });

describe('organization creation is restricted (L2)', () => {
  it('one_per_user: a second organization is refused with Better Auth code', async () => {
    const user = await new TestUser(t.app, uniqueEmail('one-org'), 'One').signUp();
    await user.createOrganization('First Org');
    const second = await createRequest(user, 'Second');
    expect(second.status).toBe(403);
    expect(second.body).toMatchObject({ code: 'YOU_ARE_NOT_ALLOWED_TO_CREATE_A_NEW_ORGANIZATION' });
  });

  it('one_per_user: of concurrent creations by one account exactly one wins', async () => {
    const user = await new TestUser(t.app, uniqueEmail('racer'), 'Racer').signUp();
    const replies = await Promise.all(Array.from({ length: 6 }, (_, i) => createRequest(user, `Race${i}`)));
    expect(replies.filter((reply) => reply.status === 200)).toHaveLength(1);
    expect(replies.filter((reply) => reply.status === 403)).toHaveLength(5);
    const owned = await t.handle.db.select().from(schema.member).where(eq(schema.member.userId, (await userId(user.email))!));
    expect(owned).toHaveLength(1);
  });

  it('one_per_user: handing the owner role over and stepping down does not free the slot', async () => {
    const founder = await new TestUser(t.app, uniqueEmail('founder'), 'Founder').signUp();
    await founder.createOrganization('Handover');
    const successor = await new TestUser(t.app, uniqueEmail('successor'), 'Successor').signUp();
    await successor.joinAs(founder, 'owner');
    const members = await successor.get<unknown>('/api/auth/organization/list-members');
    const founderMember = (members.body as unknown as { members: { id: string; user: { email: string } }[] }).members.find((m) => m.user.email === founder.email)!;
    expect((await successor.post('/api/auth/organization/update-member-role', { memberId: founderMember.id, role: 'admin' })).status).toBe(200);
    expect((await createRequest(founder, 'Again')).status).toBe(403);
  });

  it('one_per_user: the instance admins are not limited', async () => {
    const admin = await new TestUser(t.app, ADMIN_EMAIL, 'Admin').signUp();
    await admin.createOrganization('Admin One');
    await admin.createOrganization('Admin Two');
    expect((await createRequest(admin, 'Admin Three')).status).toBe(200);
  });
});

const userId = async (email: string): Promise<string | undefined> =>
  (await t.handle.db.select({ id: schema.user.id }).from(schema.user).where(eq(schema.user.email, email)))[0]?.id;

