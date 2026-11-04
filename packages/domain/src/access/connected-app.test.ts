import { describe, expect, it } from 'vitest';
import { isApiKeySecret } from './api-key.js';
import {
  CONNECTED_APP_ACCESS_TOKEN_PREFIX,
  CONNECTED_APP_REFRESH_TOKEN_PREFIX,
  connectedAppSchema,
  consentPreviewRequestSchema,
  consentPreviewSchema,
  isConnectedAppAccessToken,
  MCP_OAUTH_SCOPE,
  MCP_OAUTH_SCOPES,
} from './connected-app.js';
import { forbiddenPermissions, grantablePermissions, MACHINE_FORBIDDEN_PERMISSIONS } from './machine-access.js';

describe('connected app tokens', () => {
  it('tells an access token from an API key by its prefix, never both', () => {
    const token = `${CONNECTED_APP_ACCESS_TOKEN_PREFIX}${'A'.repeat(32)}`;
    expect(isConnectedAppAccessToken(token)).toBe(true);
    expect(isApiKeySecret(token)).toBe(false);
    expect(isConnectedAppAccessToken(`candydati_Ab12Cd34_${'a'.repeat(32)}`)).toBe(false);
    expect(isConnectedAppAccessToken(`${CONNECTED_APP_REFRESH_TOKEN_PREFIX}${'A'.repeat(32)}`)).toBe(false);
  });

  it('refuses empty, short or oddly shaped tokens', () => {
    for (const bad of ['', CONNECTED_APP_ACCESS_TOKEN_PREFIX, `${CONNECTED_APP_ACCESS_TOKEN_PREFIX}short`, `${CONNECTED_APP_ACCESS_TOKEN_PREFIX}${'A'.repeat(32)} `, `${CONNECTED_APP_ACCESS_TOKEN_PREFIX}${'A'.repeat(31)}!`]) {
      expect(isConnectedAppAccessToken(bad)).toBe(false);
    }
    expect(isConnectedAppAccessToken(42)).toBe(false);
  });

  it('asks for the MCP scope and offline access only', () => {
    expect(MCP_OAUTH_SCOPES).toEqual([MCP_OAUTH_SCOPE, 'offline_access']);
  });
});

describe('connected app access', () => {
  it('a connected app can never do what no machine may do, nor move a candidate (a decision about a person)', () => {
    expect(forbiddenPermissions('connected_app')).toEqual([...MACHINE_FORBIDDEN_PERMISSIONS, 'candidate:move']);
    expect(grantablePermissions('owner', 'connected_app')).not.toContain('candidate:move');
    expect(grantablePermissions('recruiter', 'connected_app')).toContain('job:publish');
  });
});

describe('wire schemas', () => {
  it('parses a connected app and a consent preview', () => {
    const app = {
      id: 'g1',
      clientId: 'c1',
      clientName: 'Claude',
      clientUri: null,
      userId: 'u1',
      userName: 'Ada',
      scopes: ['mcp', 'offline_access'],
      connectedAt: '2026-11-04T10:00:00.000Z',
      updatedAt: '2026-11-04T10:00:00.000Z',
    };
    expect(connectedAppSchema.parse(app)).toEqual(app);
    const preview = {
      client: { clientId: 'c1', name: 'Claude', uri: 'https://claude.ai', icon: null, redirectUri: 'https://claude.ai/api/mcp/auth_callback' },
      scopes: ['mcp'],
      organizations: [{ id: 'o1', name: 'Acme', role: 'recruiter', active: true, twoFactorRequired: false }],
    };
    expect(consentPreviewSchema.parse(preview)).toEqual(preview);
    expect(consentPreviewSchema.safeParse({ ...preview, organizations: [{ ...preview.organizations[0], role: 'pilot' }] }).success).toBe(false);
  });

  it('bounds the signed query the consent page sends', () => {
    expect(consentPreviewRequestSchema.parse({ oauthQuery: 'client_id=a&sig=b' })).toEqual({ oauthQuery: 'client_id=a&sig=b' });
    expect(consentPreviewRequestSchema.safeParse({ oauthQuery: '' }).success).toBe(false);
    expect(consentPreviewRequestSchema.safeParse({ oauthQuery: 'x'.repeat(8193) }).success).toBe(false);
  });
});
