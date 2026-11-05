import { CONNECTED_APP_ACCESS_TOKEN_PREFIX } from '@candydati/domain';
import { describe, expect, it } from 'vitest';
import { createInMemoryMemberRoles } from '../../testing/in-memory-api-keys.js';
import { createInMemoryConnectedApps, type StoredConnectedAppToken } from '../../testing/in-memory-connected-apps.js';
import { createInMemorySecuritySettings } from '../../testing/in-memory-security-settings.js';
import { createInMemoryTwoFactor } from '../../testing/in-memory-two-factor.js';
import { authenticateConnectedApp, hashConnectedAppToken } from './authenticate-connected-app.js';
import { can } from '../../authorization.js';

const NOW = new Date('2026-11-04T10:00:00.000Z');
const RESOURCE = 'https://ats.example.org/mcp';
const RAW = 'A'.repeat(32);
const TOKEN = `${CONNECTED_APP_ACCESS_TOKEN_PREFIX}${RAW}`;

function world(overrides: Partial<StoredConnectedAppToken> = {}) {
  const connectedApps = createInMemoryConnectedApps();
  connectedApps.addGrant({ id: 'grant_1', organizationId: 'org_a', clientId: 'client_1', clientName: 'Claude', clientUri: null, userId: 'user_rec', scopes: ['mcp', 'offline_access'], createdAt: NOW, updatedAt: NOW });
  connectedApps.addToken({ hash: hashConnectedAppToken(RAW), organizationId: 'org_a', clientId: 'client_1', userId: 'user_rec', scopes: ['mcp', 'offline_access'], resources: [RESOURCE], expiresAt: new Date(NOW.getTime() + 60_000), ...overrides });
  const memberRoles = createInMemoryMemberRoles({ 'org_a|user_rec': 'recruiter' });
  const securitySettings = createInMemorySecuritySettings();
  const twoFactor = createInMemoryTwoFactor();
  const deps = { connectedApps, memberRoles, securitySettings, twoFactor, hash: hashConnectedAppToken, now: () => NOW, resource: RESOURCE };
  return { deps, connectedApps, memberRoles, securitySettings, twoFactor };
}

describe('authenticateConnectedApp', () => {
  it('turns a live token into an actor acting for the person, with their role, in the organization they picked', async () => {
    const actor = await authenticateConnectedApp(world().deps, TOKEN);
    expect(actor).toMatchObject({ type: 'connected_app', id: 'grant_1', organizationId: 'org_a', role: 'recruiter', onBehalfOfUserId: 'user_rec' });
    // The role's permissions, minus what no machine may do.
    expect(can(actor!, 'job:publish')).toBe(true);
    expect(can(actor!, 'message:send')).toBe(false);
    expect(can(actor!, 'candidate:decide')).toBe(false);
    expect(can(actor!, 'candidate:move')).toBe(false);
    expect(can(actor!, 'candidate:propose_move')).toBe(false);
  });

  it('may propose moves only when the person granted that scope on the consent page', async () => {
    const actor = await authenticateConnectedApp(world({ scopes: ['mcp', 'candidate:propose_move', 'offline_access'] }).deps, TOKEN);
    expect(can(actor!, 'candidate:propose_move')).toBe(true);
    expect(can(actor!, 'candidate:move')).toBe(false);
    expect(can(actor!, 'job:publish')).toBe(true);
  });

  it('stores tokens like Better Auth: SHA-256 base64url of the token without its prefix', () => {
    expect(hashConnectedAppToken('abc')).toBe('ungWv48Bz-pBQUDeXa4iI7ADYaOWF3qctBD_YfIAFa0');
  });

  it('refuses anything that is not a well-formed, known, live token of this resource', async () => {
    const { deps } = world();
    for (const bad of ['', RAW, `candydati_Ab12Cd34_${'a'.repeat(32)}`, `${CONNECTED_APP_ACCESS_TOKEN_PREFIX}${'B'.repeat(32)}`]) {
      expect(await authenticateConnectedApp(deps, bad)).toBeNull();
    }
    expect(await authenticateConnectedApp(world({ expiresAt: NOW }).deps, TOKEN)).toBeNull();
    expect(await authenticateConnectedApp(world({ resources: [] }).deps, TOKEN)).toBeNull();
    expect(await authenticateConnectedApp(world({ resources: ['https://evil.example/mcp'] }).deps, TOKEN)).toBeNull();
    expect(await authenticateConnectedApp(world({ scopes: ['offline_access'] }).deps, TOKEN)).toBeNull();
  });

  it('refuses a token whose grant was revoked, whose client was disabled or whose person left', async () => {
    const revoked = world();
    await revoked.connectedApps.revoke((await revoked.connectedApps.findById('org_a', 'grant_1'))!);
    expect(await authenticateConnectedApp(revoked.deps, TOKEN)).toBeNull();

    const disabled = world();
    disabled.connectedApps.disableClient('client_1');
    expect(await authenticateConnectedApp(disabled.deps, TOKEN)).toBeNull();

    const left = world();
    left.memberRoles.set('org_a', 'user_rec', null);
    expect(await authenticateConnectedApp(left.deps, TOKEN)).toBeNull();
  });

  it('reads the role now: a demoted person gets the smaller role', async () => {
    const w = world();
    w.memberRoles.set('org_a', 'user_rec', 'interviewer');
    expect((await authenticateConnectedApp(w.deps, TOKEN))?.role).toBe('interviewer');
  });

  it('suspends an owner without 2FA when the organization requires it, like their session and keys', async () => {
    const w = world();
    w.memberRoles.set('org_a', 'user_rec', 'owner');
    await w.securitySettings.setRequireTwoFactor('org_a', true, NOW);
    expect(await authenticateConnectedApp(w.deps, TOKEN)).toBeNull();
    w.twoFactor.enable('user_rec');
    expect((await authenticateConnectedApp(w.deps, TOKEN))?.role).toBe('owner');
  });
});
