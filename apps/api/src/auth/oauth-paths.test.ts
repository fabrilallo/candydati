import { describe, expect, it } from 'vitest';
import { DISCOVERY_PATHS, isOAuthMachinePath, isUnroutedOAuthPath } from './oauth-paths.js';

describe('isUnroutedOAuthPath', () => {
  it('routes only the endpoints of the authorization code flow', () => {
    for (const path of ['authorize', 'consent', 'continue', 'token', 'revoke', 'register']) {
      expect(isUnroutedOAuthPath(`/api/auth/oauth2/${path}`)).toBe(false);
      expect(isUnroutedOAuthPath(`/api/auth/oauth2/${path}?x=1`)).toBe(false);
    }
  });

  it('hides client and consent management, userinfo, introspection, logout and admin endpoints', () => {
    for (const path of [
      '/api/auth/oauth2/create-client',
      '/api/auth/oauth2/get-clients',
      '/api/auth/oauth2/update-client',
      '/api/auth/oauth2/delete-client',
      '/api/auth/oauth2/client/rotate-secret',
      '/api/auth/oauth2/get-consents',
      '/api/auth/oauth2/delete-consent',
      '/api/auth/oauth2/public-client?client_id=x',
      '/api/auth/oauth2/userinfo',
      '/api/auth/oauth2/introspect',
      '/api/auth/oauth2/end-session',
      '/api/auth/admin/oauth2/create-client',
      '/api/auth/admin/oauth2/resources',
      '/api/auth/oauth2/token/../create-client',
    ]) {
      expect(isUnroutedOAuthPath(path)).toBe(true);
    }
  });

  it('leaves the rest of Better Auth alone', () => {
    expect(isUnroutedOAuthPath('/api/auth/sign-in/email')).toBe(false);
    expect(isUnroutedOAuthPath('/api/auth/get-session')).toBe(false);
  });
});

describe('isOAuthMachinePath', () => {
  it('is the token and revocation endpoints that MCP clients call from their servers', () => {
    expect(isOAuthMachinePath({ method: 'POST', url: '/api/auth/oauth2/token' })).toBe(true);
    expect(isOAuthMachinePath({ method: 'POST', url: '/api/auth/oauth2/revoke' })).toBe(true);
    expect(isOAuthMachinePath({ method: 'POST', url: '/api/auth/oauth2/register' })).toBe(false);
    expect(isOAuthMachinePath({ method: 'GET', url: '/api/auth/oauth2/token' })).toBe(false);
  });
});

describe('DISCOVERY_PATHS', () => {
  it('covers the resource metadata and the authorization server metadata, root and path-inserted', () => {
    expect([...DISCOVERY_PATHS].sort()).toEqual([
      '/.well-known/oauth-authorization-server',
      '/.well-known/oauth-authorization-server/api/auth',
      '/.well-known/oauth-protected-resource',
      '/.well-known/oauth-protected-resource/mcp',
    ]);
  });
});
