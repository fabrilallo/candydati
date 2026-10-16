import { eq, schema } from '@candydati/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TestUser } from '../testing/client.js';
import { pathOf } from '../testing/mailbox.js';
import { createTestApp, PASSWORD, uniqueEmail, WEB_ORIGIN, type TestApp } from '../testing/test-app.js';
import { totpFromUri } from '../testing/totp.js';

let t: TestApp;
let inviteOnly: TestApp;
beforeAll(async () => {
  t = await createTestApp();
  inviteOnly = await createTestApp({ env: { SIGNUP_MODE: 'invite_only' } });
});
afterAll(async () => {
  await Promise.all([t.close(), inviteOnly.close()]);
});

const post = (app: TestApp, url: string, payload: object, cookie?: string) =>
  app.app.inject({ method: 'POST', url, headers: { origin: WEB_ORIGIN, 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, payload });
/** An existing user and organization to act as the inviter of an invitation. */
const anInviter = async (app: TestApp): Promise<{ readonly userId: string; readonly organizationId: string }> => {
  const [user] = await app.handle.db.select({ id: schema.user.id }).from(schema.user).limit(1);
  const [organization] = await app.handle.db.select({ id: schema.organization.id }).from(schema.organization).limit(1);
  if (user === undefined || organization === undefined) throw new Error('expected a user and an organization in the test database');
  return { userId: user.id, organizationId: organization.id };
};

const mailsTo = (app: TestApp, email: string, kind?: string) => app.mailbox.sent.filter((m) => m.to === email && (kind === undefined || m.email.kind === kind));

describe('sign-up with email verification (M5)', () => {
  it('gives no session until the address is confirmed, and the link signs in once', async () => {
    const email = uniqueEmail('verify');
    const signUp = await post(t, '/api/auth/sign-up/email', { email, password: PASSWORD, name: 'Verify' });
    expect(signUp.statusCode).toBe(200);
    expect(signUp.json()).toMatchObject({ token: null });
    expect(signUp.headers['set-cookie'] ?? []).not.toEqual(expect.arrayContaining([expect.stringMatching(/session_token=[^;]/)]));
    expect(mailsTo(t, email, 'verify_email')).toHaveLength(1);

    const early = await post(t, '/api/auth/sign-in/email', { email, password: PASSWORD });
    expect(early.statusCode).toBe(403);
    expect(early.json()).toMatchObject({ code: 'EMAIL_NOT_VERIFIED' });
    expect(mailsTo(t, email, 'verify_email')).toHaveLength(2);

    const user = new TestUser(t.app, email, 'Verify');
    await user.verifyEmail();
    expect((await user.get('/api/auth/get-session')).body).toMatchObject({ user: { email, emailVerified: true } });
  });

  it('answers a sign-up with a registered address exactly like a new one, and tells the owner instead', async () => {
    const existing = await new TestUser(t.app, uniqueEmail('taken'), 'Taken').signUp();
    const again = await post(t, '/api/auth/sign-up/email', { email: existing.email, password: 'another-password-1', name: 'Eve' });
    const fresh = await post(t, '/api/auth/sign-up/email', { email: uniqueEmail('fresh'), password: 'another-password-1', name: 'Eve' });
    expect(again.statusCode).toBe(fresh.statusCode);
    expect(Object.keys(again.json()).sort()).toEqual(Object.keys(fresh.json()).sort());
    expect(again.json()).toMatchObject({ token: null, user: { email: existing.email, name: 'Eve' } });
    expect(mailsTo(t, existing.email, 'existing_account')).toHaveLength(1);
    expect(mailsTo(t, existing.email, 'verify_email')).toHaveLength(1);
  });

  it('refuses the app to a session whose address is not confirmed (sessions created before verification)', async () => {
    const user = await new TestUser(t.app, uniqueEmail('legacy'), 'Legacy').signUp();
    await user.createOrganization('Legacy Org');
    await t.handle.db.update(schema.user).set({ emailVerified: false }).where(eq(schema.user.email, user.email));
    const reply = await user.get('/api/v1/audit-log');
    expect(reply.status).toBe(403);
    expect(reply.body.error).toMatchObject({ code: 'email_not_verified' });
  });
});

describe('password reset (M5)', () => {
  it('answers the same for known and unknown addresses, and mails only the known one', async () => {
    const user = await new TestUser(t.app, uniqueEmail('reset'), 'Reset').signUp();
    const unknown = uniqueEmail('nobody');
    const known = await post(t, '/api/auth/request-password-reset', { email: user.email, redirectTo: '/reset-password' });
    const missing = await post(t, '/api/auth/request-password-reset', { email: unknown, redirectTo: '/reset-password' });
    expect(known.statusCode).toBe(200);
    expect(known.json()).toEqual(missing.json());
    expect(mailsTo(t, user.email, 'reset_password')).toHaveLength(1);
    expect(mailsTo(t, unknown)).toEqual([]);
  });

  it('resets with a single-use token and signs out every session', async () => {
    const user = await new TestUser(t.app, uniqueEmail('reset2'), 'Reset').signUp();
    await post(t, '/api/auth/request-password-reset', { email: user.email, redirectTo: '/reset-password' });
    const callback = await t.app.inject({ method: 'GET', url: pathOf(t.mailbox.linkFor(user.email, 'reset_password')), headers: { origin: WEB_ORIGIN } });
    expect(callback.statusCode).toBe(302);
    const token = new URL(String(callback.headers.location), WEB_ORIGIN).searchParams.get('token')!;
    expect(token).toBeTruthy();
    expect((await post(t, '/api/auth/reset-password', { token, newPassword: 'brand-new-password-9' })).statusCode).toBe(200);
    expect((await post(t, '/api/auth/reset-password', { token, newPassword: 'another-new-password-9' })).statusCode).toBe(400);
    expect((await user.get('/api/auth/get-session')).body).toBeNull();
    expect((await post(t, '/api/auth/sign-in/email', { email: user.email, password: 'brand-new-password-9' })).statusCode).toBe(200);
  });
});

describe('invitations (M5, M6)', () => {
  it('can be accepted only by the confirmed account of the invited address', async () => {
    const owner = await new TestUser(t.app, uniqueEmail('inviter'), 'Inviter').signUp();
    await owner.createOrganization('Invite Org');
    const invited = uniqueEmail('invited');
    const invite = await owner.post<{ id: string }>('/api/auth/organization/invite-member', { email: invited, role: 'recruiter' });
    const invitationId = (invite.body as unknown as { id: string }).id;
    expect(mailsTo(t, invited, 'invitation')).toHaveLength(1);
    const other = await new TestUser(t.app, uniqueEmail('other'), 'Other').signUp();
    expect((await other.post('/api/auth/organization/accept-invitation', { invitationId })).status).toBe(403);
    const right = await new TestUser(t.app, invited, 'Invited').signUp();
    expect((await right.post('/api/auth/organization/accept-invitation', { invitationId })).status).toBe(200);
  });
});

describe('SIGNUP_MODE=invite_only (M5)', () => {
  it('refuses an address without a pending invitation, whether or not it has an account', async () => {
    const stranger = await post(inviteOnly, '/api/auth/sign-up/email', { email: uniqueEmail('stranger'), password: PASSWORD, name: 'Stranger' });
    expect(stranger.statusCode).toBe(403);
    expect(stranger.json()).toMatchObject({ code: 'SIGNUP_INVITE_ONLY' });
    expect(mailsTo(inviteOnly, 'nobody')).toEqual([]);
  });

  it('lets an invited address create its account', async () => {
    const { userId, organizationId } = await anInviter(inviteOnly);
    const email = uniqueEmail('welcome');
    await inviteOnly.handle.db.insert(schema.invitation).values({
      id: `inv-${Math.random().toString(36).slice(2)}`,
      organizationId,
      email,
      role: 'recruiter',
      status: 'pending',
      expiresAt: new Date(Date.now() + 60_000),
      inviterId: userId,
    });
    expect((await post(inviteOnly, '/api/auth/sign-up/email', { email: email.toUpperCase(), password: PASSWORD, name: 'Welcome' })).statusCode).toBe(200);
  });

  it('confirms the address only while the invitation that admitted it is still pending', async () => {
    const { userId, organizationId } = await anInviter(inviteOnly);
    const email = uniqueEmail('withdrawn');
    const invitationId = `inv-${Math.random().toString(36).slice(2)}`;
    await inviteOnly.handle.db.insert(schema.invitation).values({ id: invitationId, organizationId, email, role: 'recruiter', status: 'pending', expiresAt: new Date(Date.now() + 60_000), inviterId: userId });
    expect((await post(inviteOnly, '/api/auth/sign-up/email', { email, password: PASSWORD, name: 'Withdrawn' })).statusCode).toBe(200);
    const link = pathOf(inviteOnly.mailbox.linkFor(email, 'verify_email'));

    await inviteOnly.handle.db.update(schema.invitation).set({ status: 'canceled' }).where(eq(schema.invitation.id, invitationId));
    const refused = await inviteOnly.app.inject({ method: 'GET', url: link, headers: { origin: WEB_ORIGIN } });
    // The link carries the app's callback: the refusal lands there with the reason instead of a raw JSON answer.
    expect(refused.statusCode).toBe(302);
    expect(refused.headers.location).toMatch(/[?&]error=SIGNUP_INVITE_ONLY$/);
    const [account] = await inviteOnly.handle.db.select({ emailVerified: schema.user.emailVerified }).from(schema.user).where(eq(schema.user.email, email));
    expect(account).toEqual({ emailVerified: false });

    await inviteOnly.handle.db.update(schema.invitation).set({ status: 'pending' }).where(eq(schema.invitation.id, invitationId));
    const confirmed = await inviteOnly.app.inject({ method: 'GET', url: link, headers: { origin: WEB_ORIGIN } });
    expect(confirmed.statusCode).toBe(302);
    expect(confirmed.headers.location).not.toContain('error=');
  });
});

describe('two-factor authentication (optional, enforced per organization)', () => {
  it('when required, owners must enrol before using the app; recruiters are not affected', async () => {
    const owner = await new TestUser(t.app, uniqueEmail('2fa-owner'), 'Owner').signUp();
    await owner.createOrganization('Secure Org');
    const recruiter = await new TestUser(t.app, uniqueEmail('2fa-rec'), 'Rec').signUp();
    await recruiter.joinAs(owner, 'recruiter');
    expect((await owner.put('/api/v1/settings/security', { requireTwoFactor: true })).status).toBe(200);

    expect((await owner.get('/api/v1/audit-log')).body.error).toMatchObject({ code: 'two_factor_required' });
    expect((await recruiter.get('/api/v1/settings/security')).status).toBe(200);

    const enabled = await owner.post<never>('/api/auth/two-factor/enable', { password: PASSWORD });
    const { totpURI, backupCodes } = enabled.body as unknown as { totpURI: string; backupCodes: string[] };
    expect(backupCodes.length).toBeGreaterThan(0);
    expect((await owner.post('/api/auth/two-factor/verify-totp', { code: totpFromUri(totpURI) })).status).toBe(200);
    expect((await owner.get('/api/v1/audit-log')).status).toBe(200);

    const signIn = await post(t, '/api/auth/sign-in/email', { email: owner.email, password: PASSWORD });
    expect(signIn.json()).toMatchObject({ twoFactorRedirect: true });
  });

  it('cannot be changed with an API key or by a recruiter', async () => {
    const owner = await new TestUser(t.app, uniqueEmail('2fa-key'), 'Owner').signUp();
    await owner.createOrganization('Key Org');
    const recruiter = await new TestUser(t.app, uniqueEmail('2fa-rec2'), 'Rec').signUp();
    await recruiter.joinAs(owner, 'recruiter');
    expect((await recruiter.put('/api/v1/settings/security', { requireTwoFactor: true })).status).toBe(403);
    expect((await recruiter.get('/api/v1/settings/security')).body.data).toEqual({ requireTwoFactor: false });
  });
});
