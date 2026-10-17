import { describe, expect, it, vi } from 'vitest';
import { firstOwnerDatabaseHooks } from './first-owner-hooks.js';
import { BOOTSTRAP_TOKEN_HEADER, SIGNUP_PATH, type SignupLookups, type SignupPolicy } from './signup-policy.js';

const CODE = 'first-owner-setup-code-of-at-least-32-characters';
const POLICY: SignupPolicy = { mode: 'invite_only', bootstrapToken: CODE, requireBootstrapToken: true };
const lookups = (overrides: Partial<SignupLookups> = {}): SignupLookups => ({
  hasPendingInvitation: vi.fn(async () => false),
  claimBootstrap: vi.fn(async () => true),
  confirmBootstrapOwner: vi.fn(async () => true),
  holdsBootstrapClaim: vi.fn(async () => true),
  ...overrides,
});
const signUpContext = (code: string | null, updateUser = vi.fn(async () => undefined)) => ({
  path: SIGNUP_PATH,
  headers: new Headers(code === null ? {} : { [BOOTSTRAP_TOKEN_HEADER]: code }),
  context: { internalAdapter: { updateUser } },
});
const USER = { id: 'u1', email: 'Owner@Example.com', emailVerified: true };

describe('firstOwnerDatabaseHooks', () => {
  it('confirms the address of the claim holder that presents the setup code', async () => {
    const found = lookups();
    expect(await firstOwnerDatabaseHooks(POLICY, found).user.create.before(USER, signUpContext(CODE))).toEqual({ data: { emailVerified: true } });
    expect(found.holdsBootstrapClaim).toHaveBeenCalledWith('owner@example.com', expect.any(Date));
  });

  it('leaves every other sign-up to the email confirmation', async () => {
    const hooks = (policy: SignupPolicy, found = lookups()) => firstOwnerDatabaseHooks(policy, found).user.create.before;
    expect(await hooks(POLICY)(USER, signUpContext(null))).toBeUndefined();
    expect(await hooks(POLICY)(USER, signUpContext('a-wrong-code-of-at-least-32-characters-x'))).toBeUndefined();
    expect(await hooks(POLICY, lookups({ holdsBootstrapClaim: vi.fn(async () => false) }))(USER, signUpContext(CODE))).toBeUndefined();
    expect(await hooks({ ...POLICY, mode: 'open' })(USER, signUpContext(CODE))).toBeUndefined();
    expect(await hooks({ ...POLICY, bootstrapToken: null, requireBootstrapToken: false })(USER, signUpContext(null))).toBeUndefined();
    expect(await hooks(POLICY)(USER, { ...signUpContext(CODE), path: '/sign-in/email' })).toBeUndefined();
    expect(await hooks(POLICY)(USER, null)).toBeUndefined();
  });

  it('records the first owner after the account exists', async () => {
    const found = lookups();
    const updateUser = vi.fn(async () => undefined);
    await firstOwnerDatabaseHooks(POLICY, found).user.create.after(USER, signUpContext(CODE, updateUser));
    expect(found.confirmBootstrapOwner).toHaveBeenCalledWith({ id: 'u1', email: 'owner@example.com' }, expect.any(Date));
    expect(updateUser).not.toHaveBeenCalled();
  });

  it('takes the confirmation back when the owner cannot be recorded (the claim changed in between)', async () => {
    const updateUser = vi.fn(async () => undefined);
    await firstOwnerDatabaseHooks(POLICY, lookups({ confirmBootstrapOwner: vi.fn(async () => false) })).user.create.after(USER, signUpContext(CODE, updateUser));
    expect(updateUser).toHaveBeenCalledWith('u1', { emailVerified: false });
  });

  it('does nothing after an ordinary, unconfirmed sign-up', async () => {
    const found = lookups();
    await firstOwnerDatabaseHooks(POLICY, found).user.create.after({ ...USER, emailVerified: false }, signUpContext(null));
    expect(found.confirmBootstrapOwner).not.toHaveBeenCalled();
  });
});
