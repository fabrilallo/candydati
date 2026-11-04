const OAUTH_PREFIX = '/api/auth/oauth2/';
const ADMIN_OAUTH_PREFIX = '/api/auth/admin/oauth2';

/**
 * The OAuth provider endpoints reachable from outside: the authorization code flow with PKCE and dynamic registration.
 * Client and consent CRUD, userinfo, introspection, logout and admin endpoints are not routed: connected apps are
 * managed through `/api/v1/connected-apps` (audited), and a new endpoint of a Better Auth release stays hidden until
 * someone decides otherwise.
 */
const ROUTED: ReadonlySet<string> = new Set(['authorize', 'consent', 'continue', 'token', 'revoke', 'register'].map((name) => `${OAUTH_PREFIX}${name}`));

const pathOf = (url: string): string => url.split('?')[0] ?? '';

export const isUnroutedOAuthPath = (url: string): boolean => {
  const path = pathOf(url);
  return path.startsWith(ADMIN_OAUTH_PREFIX) || (path.startsWith(OAUTH_PREFIX) && !ROUTED.has(path));
};

const MACHINE_PATHS: ReadonlySet<string> = new Set([`${OAUTH_PREFIX}token`, `${OAUTH_PREFIX}revoke`]);

/** Called by MCP clients from their servers (one address for many people): they get the api-wide budget, not sign-in's. */
export const isOAuthMachinePath = (request: { readonly method: string; readonly url: string }): boolean =>
  request.method === 'POST' && MACHINE_PATHS.has(pathOf(request.url));

/**
 * Discovery documents at the web origin: the protected resource metadata of `/mcp` (RFC 9728, at the root too for
 * clients that look there) and the authorization server metadata of the issuer `{origin}/api/auth` (RFC 8414
 * path-inserted, and the root for older clients).
 */
export const PROTECTED_RESOURCE_PATHS: readonly string[] = ['/.well-known/oauth-protected-resource', '/.well-known/oauth-protected-resource/mcp'];
export const AUTHORIZATION_SERVER_PATHS: readonly string[] = ['/.well-known/oauth-authorization-server', '/.well-known/oauth-authorization-server/api/auth'];
export const DISCOVERY_PATHS: ReadonlySet<string> = new Set([...PROTECTED_RESOURCE_PATHS, ...AUTHORIZATION_SERVER_PATHS]);
