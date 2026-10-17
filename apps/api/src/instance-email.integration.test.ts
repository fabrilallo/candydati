import { schema } from '@candydati/db';
import type { CareersPageEditorDto, InstanceEmailSettingsDto } from '@candydati/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { InstanceEmailTester } from '@candydati/core';
import { TestUser } from './testing/client.js';
import { createTestApp, uniqueEmail, type TestApp } from './testing/test-app.js';

const ADMIN_EMAIL = uniqueEmail('instance-admin');
const sent: { transport: unknown; to: string; from: string }[] = [];
let refuse: string | null = null;
const tester: InstanceEmailTester = {
  async send(transport, email) {
    if (refuse !== null) throw new Error(refuse);
    sent.push({ transport, to: email.to, from: email.from });
  },
};

let t: TestApp;
let admin: TestUser;
let colleague: TestUser;

beforeAll(async () => {
  // No EMAIL_PROVIDER: the instance starts without email, its administrator configures it from the app.
  t = await createTestApp({ env: { EMAIL_PROVIDER: '', INSTANCE_ADMIN_EMAILS: ADMIN_EMAIL }, instanceEmailTester: tester });
  await t.handle.db.delete(schema.instanceEmailSettings);
  admin = await new TestUser(t.app, ADMIN_EMAIL, 'Admin').signUp();
  await admin.createOrganization('Instance Email Co');
  colleague = await new TestUser(t.app, uniqueEmail('colleague'), 'Colleague').signUp();
  await colleague.createOrganization('Other Co');
});
afterAll(async () => {
  await t.handle.db.delete(schema.instanceEmailSettings);
  await t.close();
});

const settingsOf = async (user: TestUser) => (await user.get<InstanceEmailSettingsDto>('/api/v1/instance/email-settings')).body.data!;
const publishCareers = async (user: TestUser) => {
  const revision = (await user.get<CareersPageEditorDto>('/api/v1/careers-page')).body.data!.revision;
  return user.post('/api/v1/careers-page/publish', { revision });
};
const SMTP = { provider: 'smtp', smtp: { host: 'smtp.example.com', port: 587, secure: false, user: 'apikey', password: 'smtp-secret' }, sendingDomain: 'Mail.Example.com', fromLocal: 'jobs' };

describe('instance email configured from the app', () => {
  it('starts closed: nothing configured, invitations and publishing wait for email', async () => {
    expect(await settingsOf(admin)).toMatchObject({ source: 'none', ready: false, canManage: true });
    expect(await settingsOf(colleague)).toMatchObject({ ready: false, canManage: false });

    const invite = await admin.post('/api/auth/organization/invite-member', { email: uniqueEmail('invitee'), role: 'recruiter' });
    expect(invite.status).toBe(400);
    expect(invite.body).toMatchObject({ code: 'EMAIL_NOT_CONFIGURED' });

    const publish = await publishCareers(admin);
    expect(publish.status).toBe(422);
    expect(JSON.stringify(publish.body)).toContain('email_not_configured');
  });

  it('saves nothing when the test email is refused, and says why', async () => {
    refuse = 'domain is not verified';
    const reply = await admin.put('/api/v1/instance/email-settings', SMTP);
    refuse = null;
    expect(reply.status).toBe(422);
    expect(JSON.stringify(reply.body)).toContain('email_test_failed');
    expect(await t.handle.db.select().from(schema.instanceEmailSettings)).toEqual([]);
  });

  it('is changed only by the instance administrator', async () => {
    expect((await colleague.put('/api/v1/instance/email-settings', SMTP)).status).toBe(403);
  });

  it('saves after a test email to the administrator, keeps the secret sealed, and opens the instance at once', async () => {
    const reply = await admin.put('/api/v1/instance/email-settings', SMTP);
    expect(reply.status).toBe(200);
    expect(sent.at(-1)).toMatchObject({ to: ADMIN_EMAIL, from: expect.stringContaining('<jobs@mail.example.com>'), transport: { kind: 'smtp', host: 'smtp.example.com', password: 'smtp-secret' } });
    expect(JSON.stringify(reply.body)).not.toContain('smtp-secret');
    const [row] = await t.handle.db.select().from(schema.instanceEmailSettings);
    expect(row?.secretCiphertext).toMatch(/^sb1\./);
    expect(row?.secretCiphertext).not.toContain('smtp-secret');

    expect(await settingsOf(colleague)).toMatchObject({ source: 'app', ready: true, provider: 'smtp', sendingDomain: 'mail.example.com', smtp: { hasPassword: true } });
    expect((await admin.post('/api/auth/organization/invite-member', { email: uniqueEmail('invitee'), role: 'recruiter' })).status).toBe(200);
    expect((await publishCareers(admin)).status).toBe(200);
  });
});
