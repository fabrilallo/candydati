import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createKey, withKey } from '../testing/api-keys.js';
import { TestUser } from '../testing/client.js';
import { createTestApp, PASSWORD, uniqueEmail, type TestApp } from '../testing/test-app.js';
import { totpFromUri } from '../testing/totp.js';

let t: TestApp;
beforeAll(async () => {
  t = await createTestApp();
});
afterAll(async () => {
  await t.close();
});

const enrol = async (user: TestUser): Promise<void> => {
  const enabled = await user.post('/api/auth/two-factor/enable', { password: PASSWORD });
  const { totpURI } = enabled.body as unknown as { totpURI: string };
  expect((await user.post('/api/auth/two-factor/verify-totp', { code: totpFromUri(totpURI) })).status).toBe(200);
};

/** An organization that requires 2FA, its owner (no 2FA yet), a recruiter and a pending invitation. */
async function securedOrganization(label: string) {
  const owner = await new TestUser(t.app, uniqueEmail(`${label}-owner`), 'Owner').signUp();
  const organizationId = await owner.createOrganization(`${label} Org`);
  const recruiter = await new TestUser(t.app, uniqueEmail(`${label}-rec`), 'Rec').signUp();
  await recruiter.joinAs(owner, 'recruiter');
  const invitation = await owner.post<{ id: string }>('/api/auth/organization/invite-member', { email: uniqueEmail(`${label}-inv`), role: 'recruiter' });
  const invitationId = (invitation.body as unknown as { id: string }).id;
  const full = await owner.get<{ members: { id: string; userId: string; role: string }[] }>('/api/auth/organization/get-full-organization');
  const recruiterMemberId = (full.body as unknown as { members: { id: string; role: string }[] }).members.find((m) => m.role === 'recruiter')!.id;
  expect((await owner.put('/api/v1/settings/security', { requireTwoFactor: true })).status).toBe(200);
  return { owner, recruiter, organizationId, invitationId, recruiterMemberId };
}

describe('2FA requirement on the Better Auth organization endpoints (M1)', () => {
  it('refuses every organization change to an owner without 2FA, with the same code as the app', async () => {
    const { owner, organizationId, invitationId, recruiterMemberId } = await securedOrganization('gate');
    const attempts: readonly [string, object][] = [
      ['/api/auth/organization/invite-member', { email: uniqueEmail('gate-new-admin'), role: 'admin' }],
      ['/api/auth/organization/update', { data: { name: 'Renamed' } }],
      ['/api/auth/organization/update-member-role', { memberId: recruiterMemberId, role: 'admin' }],
      ['/api/auth/organization/remove-member', { memberIdOrEmail: recruiterMemberId }],
      ['/api/auth/organization/cancel-invitation', { invitationId }],
      ['/api/auth/organization/update', { organizationId, data: { name: 'Renamed by id' } }],
    ];
    for (const [url, body] of attempts) {
      const reply = await owner.post(url, body);
      expect({ url, status: reply.status }).toEqual({ url, status: 403 });
      expect(reply.body).toMatchObject({ code: 'TWO_FACTOR_REQUIRED' });
    }
    const full = await owner.get('/api/auth/organization/get-full-organization');
    expect(full.body).toMatchObject({ name: 'gate Org' });
  });

  it('lets the owner through once enrolled, and never gates people the requirement does not cover', async () => {
    const { owner, recruiter, invitationId, organizationId } = await securedOrganization('gate-ok');
    expect((await recruiter.post('/api/auth/organization/leave', { organizationId })).status).not.toBe(403);
    await enrol(owner);
    expect((await owner.post('/api/auth/organization/cancel-invitation', { invitationId })).status).toBe(200);
    expect((await owner.post('/api/auth/organization/update', { data: { name: 'Renamed' } })).status).toBe(200);
  });

  it('does not gate an organization that does not require 2FA', async () => {
    const owner = await new TestUser(t.app, uniqueEmail('gate-free'), 'Owner').signUp();
    await owner.createOrganization('Free Org');
    expect((await owner.post('/api/auth/organization/invite-member', { email: uniqueEmail('gate-free-inv'), role: 'admin' })).status).toBe(200);
  });
});

describe('2FA requirement on API keys (M2)', () => {
  it('suspends the key of an owner without 2FA when the requirement is turned on, audits it, and resumes after enrolment', async () => {
    const owner = await new TestUser(t.app, uniqueEmail('key-2fa'), 'Owner').signUp();
    await owner.createOrganization('Key 2FA Org');
    const key = await createKey(owner, ['job:read']);
    expect((await withKey(t.app, key.secret, 'GET', '/api/v1/jobs')).status).toBe(200);

    const turnedOn = await owner.put<{ suspendedApiKeys: string[] }>('/api/v1/settings/security', { requireTwoFactor: true });
    expect(turnedOn.body.data?.suspendedApiKeys).toEqual([key.secret.split('_')[1]]);
    expect((await withKey(t.app, key.secret, 'GET', '/api/v1/jobs')).status).toBe(401);

    await enrol(owner);
    expect((await withKey(t.app, key.secret, 'GET', '/api/v1/jobs')).status).toBe(200);
    const audit = await owner.get<{ action: string; metadata: Record<string, unknown> }[]>('/api/v1/audit-log');
    const entry = audit.body.data?.find((item) => item.action === 'organization.security_setting_updated');
    expect(entry?.metadata).toMatchObject({ requireTwoFactor: true, suspendedApiKeys: [key.secret.split('_')[1]] });
  });
});
