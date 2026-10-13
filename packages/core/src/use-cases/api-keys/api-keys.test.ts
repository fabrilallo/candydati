import { grantablePermissions, type ApiKey, type Permission } from '@tt/domain';
import { describe, expect, it } from 'vitest';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../../errors.js';
import { authorize } from '../../authorization.js';
import { createTestApiKeyDeps, createTestJobDeps, ORG_A, ORG_B, userActor, type TestApiKeyDeps } from '../../testing/index.js';
import { createApiKey, listApiKeys, revokeApiKey, type CreatedApiKey } from './api-keys.js';
import { API_KEY_TOUCH_INTERVAL_MS, authenticateApiKey } from './authenticate-api-key.js';
import { createJob } from '../jobs/create-job.js';

const owner = userActor({ id: 'user_test', role: 'owner', organizationId: ORG_A });
const recruiterUser = userActor({ id: 'user_rec', role: 'recruiter', organizationId: ORG_A });
const DAY = 86_400_000;

const make = (deps: TestApiKeyDeps, scopes: readonly Permission[] = ['job:read'], extra: Record<string, unknown> = {}, actor = owner) =>
  createApiKey(deps, actor, { name: 'CI', scopes, ...extra }) as Promise<CreatedApiKey>;
const issues = async (promise: Promise<unknown>) => ((await promise.catch((e: unknown) => e)) as ValidationError).issues;

describe('createApiKey', () => {
  it('returns the secret once, stores only the hash and audits without the secret', async () => {
    const deps = createTestApiKeyDeps();
    const { key, secret } = await make(deps, ['job:read', 'job:read', 'candidate:read']);
    expect(secret).toMatch(/^tt_/);
    expect(key).toMatchObject({ name: 'CI', scopes: ['job:read', 'candidate:read'], createdBy: 'user_test', organizationId: ORG_A });
    expect(key.prefix).toBe(secret.split('_')[1]);
    expect(key).not.toHaveProperty('hash');
    const stored = deps.apiKeys.snapshot()[0];
    expect(stored?.hash).toBe(deps.hash(secret));
    expect(JSON.stringify(deps.apiKeys.snapshot())).not.toContain(secret);
    const events = deps.auditLog.events();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ action: 'api_key.created', target: { type: 'api_key', id: key.id } });
    expect(JSON.stringify(events)).not.toContain(secret);
  });

  it('refuses scopes the machine can never hold, and scopes the creator role lacks', async () => {
    const deps = createTestApiKeyDeps();
    for (const scope of ['candidate:decide', 'message:send', 'candidate:erase', 'member:create', 'webhook:manage', 'api_key:manage'] as const) {
      expect((await issues(make(deps, [scope])))[0]?.path).toBe('scopes');
    }
    // admin lacks organization:delete anyway; the grantable list of a role is the ceiling
    const admin = userActor({ id: 'user_test', role: 'admin', organizationId: ORG_A });
    expect(await issues(make(deps, ['organization:delete'], {}, admin))).toHaveLength(1);
    expect(deps.apiKeys.snapshot()).toHaveLength(0);
  });

  it('lets an admin grant what the role holds minus the forbidden list', async () => {
    const deps = createTestApiKeyDeps();
    const admin = userActor({ id: 'user_test', role: 'admin', organizationId: ORG_A });
    const scopes = grantablePermissions('admin', 'api_key');
    const { key } = await make(deps, scopes, {}, admin);
    expect(key.scopes).toEqual(scopes);
  });

  it('is for owners and admins only', async () => {
    const deps = createTestApiKeyDeps();
    await expect(make(deps, ['job:read'], {}, recruiterUser)).rejects.toThrow(ForbiddenError);
    await expect(listApiKeys(deps, recruiterUser, {})).rejects.toThrow(ForbiddenError);
    await expect(revokeApiKey(deps, recruiterUser, { keyId: 'x' })).rejects.toThrow(ForbiddenError);
  });

  it('refuses a key creating keys', async () => {
    const deps = createTestApiKeyDeps();
    const key = (await authenticateApiKey(deps, (await make(deps)).secret))!;
    await expect(createApiKey(deps, key, { name: 'x', scopes: ['job:read'] })).rejects.toThrow(ForbiddenError);
  });

  it('validates the name, the scopes and a past expiry', async () => {
    const deps = createTestApiKeyDeps();
    await expect(createApiKey(deps, owner, { name: '', scopes: ['job:read'] })).rejects.toThrow(ValidationError);
    await expect(createApiKey(deps, owner, { name: 'x', scopes: [] })).rejects.toThrow(ValidationError);
    expect((await issues(make(deps, ['job:read'], { expiresAt: new Date(deps.now().getTime() - 1) })))[0]?.path).toBe('expiresAt');
  });
});

describe('listApiKeys and revokeApiKey', () => {
  it('lists without secret or hash, only for the own organization', async () => {
    const deps = createTestApiKeyDeps();
    const { secret } = await make(deps);
    await make(deps, ['job:read'], {}, userActor({ id: 'user_b', role: 'owner', organizationId: ORG_B }));
    const listed = await listApiKeys(deps, owner, {});
    expect(listed).toHaveLength(1);
    expect(listed[0]).not.toHaveProperty('hash');
    expect(JSON.stringify(listed)).not.toContain(secret);
  });

  it('revokes, audits, and refuses a second time or another organization', async () => {
    const deps = createTestApiKeyDeps();
    const { key } = await make(deps);
    const revoked = await revokeApiKey(deps, owner, { keyId: key.id });
    expect(revoked.revokedAt).toEqual(deps.now());
    expect(deps.auditLog.events().map((e) => e.action)).toEqual(['api_key.created', 'api_key.revoked']);
    await expect(revokeApiKey(deps, owner, { keyId: key.id })).rejects.toThrow(ConflictError);
    await expect(revokeApiKey(deps, userActor({ id: 'user_b', role: 'owner', organizationId: ORG_B }), { keyId: key.id })).rejects.toThrow(NotFoundError);
    await expect(revokeApiKey(deps, owner, { keyId: 'missing' })).rejects.toThrow(NotFoundError);
  });
});

describe('authenticateApiKey', () => {
  it('returns a delegated actor with the scopes and the role of the creator', async () => {
    const deps = createTestApiKeyDeps();
    const { key, secret } = await make(deps, ['job:read', 'job:create']);
    expect(await authenticateApiKey(deps, secret)).toEqual({
      type: 'api_key',
      id: key.id,
      organizationId: ORG_A,
      role: 'owner',
      onBehalfOfUserId: 'user_test',
      scopes: ['job:read', 'job:create'],
    });
  });

  it('rejects malformed, unknown and altered secrets', async () => {
    const deps = createTestApiKeyDeps();
    const { secret } = await make(deps);
    expect(await authenticateApiKey(deps, 'nope')).toBeNull();
    expect(await authenticateApiKey(deps, '')).toBeNull();
    expect(await authenticateApiKey(deps, `tt_zzzzzzzz_${'a'.repeat(32)}`)).toBeNull();
    expect(await authenticateApiKey(deps, `${secret.slice(0, -1)}${secret.endsWith('0') ? '1' : '0'}`)).toBeNull();
  });

  it('rejects a revoked key and an expired one', async () => {
    const deps = createTestApiKeyDeps();
    const revoked = await make(deps);
    await revokeApiKey(deps, owner, { keyId: revoked.key.id });
    expect(await authenticateApiKey(deps, revoked.secret)).toBeNull();
    const expiring = await make(deps, ['job:read'], { expiresAt: new Date(deps.now().getTime() + DAY) });
    expect(await authenticateApiKey(deps, expiring.secret)).not.toBeNull();
    deps.advance(DAY);
    expect(await authenticateApiKey(deps, expiring.secret)).toBeNull();
  });

  it('takes the creator role at use time: a demoted creator drops the scopes the role lost', async () => {
    const deps = createTestApiKeyDeps();
    const { secret } = await make(deps, ['job:read', 'job:publish', 'candidate:move'], {}, userActor({ id: 'user_test', role: 'owner', organizationId: ORG_A }));
    deps.memberRoles.set(ORG_A, 'user_test', 'hiring_manager');
    const actor = await authenticateApiKey(deps, secret);
    expect(actor).toMatchObject({ role: 'hiring_manager', scopes: ['job:read', 'candidate:move'] });
    deps.memberRoles.set(ORG_A, 'user_test', 'interviewer');
    expect((await authenticateApiKey(deps, secret))?.scopes).toEqual(['job:read']);
  });

  it('is dead when the creator is demoted below every scope or removed', async () => {
    const deps = createTestApiKeyDeps();
    const { secret } = await make(deps, ['job:create']);
    deps.memberRoles.set(ORG_A, 'user_test', 'interviewer');
    expect(await authenticateApiKey(deps, secret)).toBeNull();
    deps.memberRoles.set(ORG_A, 'user_test', null);
    expect(await authenticateApiKey(deps, secret)).toBeNull();
  });

  it('is isolated: a creator who is a member elsewhere only does not keep the key alive', async () => {
    const deps = createTestApiKeyDeps();
    const { secret } = await make(deps);
    deps.memberRoles.set(ORG_A, 'user_test', null);
    deps.memberRoles.set(ORG_B, 'user_test', 'owner');
    expect(await authenticateApiKey(deps, secret)).toBeNull();
  });

  it('never yields forbidden scopes, even if they were inserted straight into the database', async () => {
    const deps = createTestApiKeyDeps();
    const { key, secret } = await make(deps, ['job:read']);
    const stored = deps.apiKeys.snapshot().find((k) => k.id === key.id) as ApiKey;
    deps.apiKeys.overwrite({ ...stored, scopes: ['job:read', 'candidate:decide', 'message:send'] });
    const actor = (await authenticateApiKey(deps, secret))!;
    expect(actor.scopes).toEqual(['job:read']);
    // and even with the raw scopes on the actor, authorize still refuses
    const forged = { ...actor, scopes: ['candidate:decide', 'message:send'] as const };
    expect(() => authorize(forged, 'candidate:decide')).toThrow(ForbiddenError);
    expect(() => authorize(forged, 'message:send')).toThrow(ForbiddenError);
  });

  it('a key with job:read cannot create jobs', async () => {
    const deps = createTestApiKeyDeps();
    const { secret } = await make(deps, ['job:read']);
    const actor = (await authenticateApiKey(deps, secret))!;
    expect(() => authorize(actor, 'job:read')).not.toThrow();
    expect(() => authorize(actor, 'job:create')).toThrow(ForbiddenError);
    const jobDeps = createTestJobDeps();
    await expect(createJob(jobDeps, actor, { content: { title: 'Backend Developer (Milano)' } })).rejects.toThrow(ForbiddenError);
    const writer = (await authenticateApiKey(deps, (await make(deps, ['job:read', 'job:create'])).secret))!;
    await expect(createJob(jobDeps, writer, { content: { title: 'Backend Developer (Milano)' } })).resolves.toBeDefined();
  });

  it('updates lastUsedAt at most once a minute', async () => {
    const deps = createTestApiKeyDeps();
    const { key, secret } = await make(deps);
    const lastUsed = () => deps.apiKeys.snapshot().find((k) => k.id === key.id)?.lastUsedAt;
    expect(lastUsed()).toBeNull();
    await authenticateApiKey(deps, secret);
    const first = lastUsed();
    expect(first).toEqual(deps.now());
    deps.advance(API_KEY_TOUCH_INTERVAL_MS - 1);
    await authenticateApiKey(deps, secret);
    expect(lastUsed()).toEqual(first);
    deps.advance(1);
    await authenticateApiKey(deps, secret);
    expect(lastUsed()).toEqual(deps.now());
  });
});
