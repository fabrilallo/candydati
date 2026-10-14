import { describe, expect, it } from 'vitest';
import { createTestApiKeyDeps, ORG_A, userActor, type TestApiKeyDeps } from '../../testing/index.js';
import { setSecuritySettings } from '../security/security-settings.js';
import { createApiKey, type CreatedApiKey } from './api-keys.js';
import { authenticateApiKey } from './authenticate-api-key.js';

const owner = userActor({ id: 'user_test', role: 'owner', organizationId: ORG_A });
const admin = userActor({ id: 'user_adm', role: 'admin', organizationId: ORG_A });

const keyOf = async (deps: TestApiKeyDeps, actor = owner): Promise<CreatedApiKey> =>
  (await createApiKey(deps, actor, { name: 'CI', scopes: ['job:read'] })) as CreatedApiKey;

describe('API keys and the 2FA requirement (M2)', () => {
  it('refuses a key whose creator is an owner without 2FA once the organization requires it', async () => {
    const deps = createTestApiKeyDeps();
    const { secret } = await keyOf(deps);
    expect(await authenticateApiKey(deps, secret)).not.toBeNull();
    await deps.securitySettings.setRequireTwoFactor(ORG_A, true, deps.now());
    expect(await authenticateApiKey(deps, secret)).toBeNull();
  });

  it('works again once the creator enrols (suspended, not revoked)', async () => {
    const deps = createTestApiKeyDeps();
    const { secret } = await keyOf(deps);
    await deps.securitySettings.setRequireTwoFactor(ORG_A, true, deps.now());
    deps.twoFactor.enable('user_test');
    expect(await authenticateApiKey(deps, secret)).toMatchObject({ onBehalfOfUserId: 'user_test' });
  });

  it('does not touch keys of roles the requirement does not cover (a creator now a recruiter)', async () => {
    const deps = createTestApiKeyDeps();
    const { secret } = await keyOf(deps);
    deps.memberRoles.set(ORG_A, 'user_test', 'recruiter');
    await deps.securitySettings.setRequireTwoFactor(ORG_A, true, deps.now());
    expect(await authenticateApiKey(deps, secret)).not.toBeNull();
  });

  it('audits the keys it suspends when the requirement is turned on', async () => {
    const deps = createTestApiKeyDeps();
    deps.memberRoles.set(ORG_A, 'user_adm', 'admin');
    deps.twoFactor.enable('user_adm');
    const ownerKey = await keyOf(deps);
    await keyOf(deps, admin);
    const enrolled = createTestApiKeyDeps({ apiKeys: deps.apiKeys, memberRoles: deps.memberRoles });
    const result = await setSecuritySettings(deps, owner, { requireTwoFactor: true });
    expect(result).toEqual({ requireTwoFactor: true, suspendedApiKeys: [ownerKey.key.prefix] });
    expect(deps.auditLog.events().at(-1)).toMatchObject({
      action: 'organization.security_setting_updated',
      metadata: { requireTwoFactor: true, suspendedApiKeys: [ownerKey.key.prefix] },
    });
    enrolled.twoFactor.enable('user_test');
    enrolled.twoFactor.enable('user_adm');
    expect((await setSecuritySettings(enrolled, owner, { requireTwoFactor: true })).suspendedApiKeys).toEqual([]);
  });
});
