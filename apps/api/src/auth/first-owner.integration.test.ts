import { eq, schema } from '@candydati/db';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { prepareTestDatabase } from '../testing/test-database.js';
import { createTestApp, PASSWORD, uniqueEmail, WEB_ORIGIN, type TestApp } from '../testing/test-app.js';
import { BOOTSTRAP_TOKEN_HEADER } from './signup-policy.js';

/** A database of its own: these tests are about an instance with no account at all. */
const URL_ = 'postgres://candydati:candydati@localhost:5434/candydati_api_first_owner_test';
const SETUP_CODE = 'first-owner-setup-code-of-at-least-32-characters';
let t: TestApp;

beforeAll(async () => {
  await prepareTestDatabase(URL_);
  t = await createTestApp({ databaseUrl: URL_, env: { SIGNUP_MODE: 'invite_only', BOOTSTRAP_TOKEN: SETUP_CODE } });
});
afterAll(async () => {
  await t.close();
});
beforeEach(async () => {
  await t.handle.db.delete(schema.instanceBootstrap);
  await t.handle.db.delete(schema.user);
});

const signUp = (email: string, code?: string) =>
  t.app.inject({
    method: 'POST',
    url: '/api/auth/sign-up/email',
    headers: { origin: WEB_ORIGIN, 'content-type': 'application/json', ...(code === undefined ? {} : { [BOOTSTRAP_TOKEN_HEADER]: code }) },
    payload: { email, password: PASSWORD, name: 'First Owner' },
  });
const signIn = (email: string) =>
  t.app.inject({ method: 'POST', url: '/api/auth/sign-in/email', headers: { origin: WEB_ORIGIN, 'content-type': 'application/json' }, payload: { email, password: PASSWORD } });

describe('first owner through the setup link: no email needed (the instance may have no provider yet)', () => {
  it('confirms the address at sign-up, sends no verification email, records the first owner and signs in', async () => {
    const email = uniqueEmail('owner');
    const created = await signUp(email, SETUP_CODE);
    expect(created.statusCode).toBe(200);
    expect(created.json()).toMatchObject({ user: { email, emailVerified: true } });
    expect(t.mailbox.sent.filter((mail) => mail.to === email)).toEqual([]);

    const [user] = await t.handle.db.select().from(schema.user).where(eq(schema.user.email, email));
    const [claim] = await t.handle.db.select().from(schema.instanceBootstrap);
    expect(claim?.ownerUserId).toBe(user?.id);

    const session = await signIn(email);
    expect(session.statusCode).toBe(200);
    expect(session.headers['set-cookie'] ?? []).toEqual(expect.arrayContaining([expect.stringMatching(/session_token=[^;]/)]));
  });

  it('closes the bootstrap: the same code admits nobody else afterwards', async () => {
    expect((await signUp(uniqueEmail('owner'), SETUP_CODE)).statusCode).toBe(200);
    const late = await signUp(uniqueEmail('late'), SETUP_CODE);
    expect(late.statusCode).toBe(403);
    expect(late.json()).toMatchObject({ code: 'SIGNUP_INVITE_ONLY' });
  });

  it('refuses a sign-up with a wrong code or none, and leaves it unconfirmed', async () => {
    expect((await signUp(uniqueEmail('guess'), 'a-wrong-code-of-at-least-32-characters-x')).statusCode).toBe(403);
    expect((await signUp(uniqueEmail('none'))).statusCode).toBe(403);
    expect(await t.handle.db.select().from(schema.user)).toEqual([]);
  });
});
