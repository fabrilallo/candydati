import { describe, expect, it } from 'vitest';
import { createInMemoryConnectedApps } from '../../testing/in-memory-connected-apps.js';
import { createInMemorySecuritySettings } from '../../testing/in-memory-security-settings.js';
import { previewConsent } from './preview-consent.js';

const CALLBACK = 'https://claude.ai/api/mcp/auth_callback';

function setup() {
  const connectedApps = createInMemoryConnectedApps();
  connectedApps.addClient({ clientId: 'c1', name: 'Claude', uri: 'https://claude.ai', icon: null, redirectUris: [CALLBACK] });
  connectedApps.addMembership('u1', { organizationId: 'o1', organizationName: 'Acme', role: 'admin' });
  connectedApps.addMembership('u1', { organizationId: 'o2', organizationName: 'Beta', role: 'recruiter' });
  connectedApps.addMembership('u1', { organizationId: 'o3', organizationName: 'Odd', role: 'member' });
  connectedApps.addMembership('u2', { organizationId: 'o9', organizationName: 'Other', role: 'owner' });
  const securitySettings = createInMemorySecuritySettings();
  return { deps: { connectedApps, securitySettings }, securitySettings };
}

const request = { userId: 'u1', twoFactorEnabled: false, activeOrganizationId: 'o2', clientId: 'c1', redirectUri: CALLBACK, scopes: ['mcp', 'offline_access'] };

describe('previewConsent', () => {
  it('shows the app as it declared itself and the organizations of this person, with their role there', async () => {
    expect(await previewConsent(setup().deps, request)).toEqual({
      client: { clientId: 'c1', name: 'Claude', uri: 'https://claude.ai', icon: null, redirectUri: CALLBACK },
      scopes: ['mcp', 'offline_access'],
      organizations: [
        { id: 'o1', name: 'Acme', role: 'admin', active: false, twoFactorRequired: false },
        { id: 'o2', name: 'Beta', role: 'recruiter', active: true, twoFactorRequired: false },
      ],
    });
  });

  it('marks the organizations that require 2FA of this role when the person has none', async () => {
    const { deps, securitySettings } = setup();
    await securitySettings.setRequireTwoFactor('o1', true, new Date());
    await securitySettings.setRequireTwoFactor('o2', true, new Date());
    const preview = await previewConsent(deps, request);
    expect(preview.organizations.map((o) => [o.id, o.twoFactorRequired])).toEqual([['o1', true], ['o2', false]]);
    expect((await previewConsent(deps, { ...request, twoFactorEnabled: true })).organizations[0]!.twoFactorRequired).toBe(false);
  });

  it('knows no unknown client, and no callback the client did not register', async () => {
    const { deps } = setup();
    await expect(previewConsent(deps, { ...request, clientId: 'nope' })).rejects.toMatchObject({ name: 'NotFoundError' });
    await expect(previewConsent(deps, { ...request, redirectUri: 'https://evil.example/cb' })).rejects.toMatchObject({ name: 'NotFoundError' });
  });
});
