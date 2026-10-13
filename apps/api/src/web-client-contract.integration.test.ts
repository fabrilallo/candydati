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

const raw = <T>(reply: { body: unknown }) => reply.body as unknown as T;

describe('contract expected by the web app Better Auth client', () => {
  it('sign-up needs no verification and getSession exposes user and activeOrganizationId', async () => {
    const user = await new TestUser(t.app, uniqueEmail('web'), 'Web User').signUp();
    const session = raw<{ user: { id: string; name: string; email: string }; session: { activeOrganizationId?: string | null } } | null>(
      await user.get('/api/auth/get-session'),
    );
    expect(session?.user).toMatchObject({ name: 'Web User', email: user.email });
    expect(session?.session.activeOrganizationId ?? null).toBeNull();
  });

  it('create activates the organization; getFullOrganization has members and invitations in the expected shape', async () => {
    const owner = await new TestUser(t.app, uniqueEmail('own'), 'Owner').signUp();
    const orgId = await owner.createOrganization('Acme Web');
    const session = raw<{ session: { activeOrganizationId: string } }>(await owner.get('/api/auth/get-session'));
    expect(session.session.activeOrganizationId).toBe(orgId);

    const invitee = await new TestUser(t.app, uniqueEmail('inv'), 'Invitee').signUp();
    const invite = raw<{ id: string }>(await owner.post('/api/auth/organization/invite-member', { email: invitee.email, role: 'recruiter' }));

    const full = raw<{
      id: string;
      name: string;
      slug: string;
      members: { id: string; userId: string; role: string; user: { name: string; email: string } }[];
      invitations: { id: string; email: string; role: string; status: string; expiresAt: string }[];
    }>(await owner.get('/api/auth/organization/get-full-organization'));
    expect(full).toMatchObject({ id: orgId, name: 'Acme Web', slug: expect.any(String) });
    expect(full.members[0]).toMatchObject({ role: 'owner', user: { name: 'Owner', email: owner.email } });
    expect(full.invitations[0]).toMatchObject({ id: invite.id, email: invitee.email, role: 'recruiter', status: 'pending' });
    expect(full.invitations[0]!.expiresAt).toBeTruthy();

    const info = await invitee.get(`/api/auth/organization/get-invitation?id=${invite.id}`);
    expect(info.status).toBe(200);
    expect(raw(info)).toMatchObject({
      id: invite.id,
      email: invitee.email,
      role: 'recruiter',
      status: 'pending',
      organizationId: orgId,
      organizationName: 'Acme Web',
      inviterEmail: owner.email,
    });
  });

  it('list + set-active make an existing organization active', async () => {
    const owner = await new TestUser(t.app, uniqueEmail('own2'), 'Owner2').signUp();
    const orgId = await owner.createOrganization('Second');
    const again = new TestUser(t.app, owner.email, 'Owner2');
    expect((await again.post('/api/auth/sign-in/email', { email: owner.email, password: 'correct-horse-battery' })).status).toBe(200);
    const list = raw<{ id: string }[]>(await again.get('/api/auth/organization/list'));
    expect(list[0]!.id).toBe(orgId);
    expect((await again.post('/api/auth/organization/set-active', { organizationId: orgId })).status).toBe(200);
    expect((await again.get('/api/v1/audit-log?page=1&limit=20')).status).toBe(200);
  });
});
