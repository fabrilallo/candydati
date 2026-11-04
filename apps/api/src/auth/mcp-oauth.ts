import { hashConnectedAppToken } from '@candydati/core';
import {
  CONNECTED_APP_ACCESS_TOKEN_PREFIX,
  CONNECTED_APP_CLIENT_SECRET_PREFIX,
  CONNECTED_APP_REFRESH_TOKEN_PREFIX,
  isRole,
  MCP_OAUTH_SCOPES,
} from '@candydati/domain';
import { mcp } from '@better-auth/mcp';
import { APIError, createAuthMiddleware, getSessionFromCtx } from 'better-auth/api';
import type { Env } from '../config/env.js';
import { consentRefusal, grantedClientOf, registrationRefusal, type ConsentGateLookups } from './mcp-oauth-gates.js';
import type { McpOAuthSettings } from './mcp-oauth-settings.js';

/** Web pages of the flow (apps/web/app/pages/oauth): sign-in resumes on the first, the second asks for consent. */
export const OAUTH_AUTHORIZE_PAGE = '/oauth/authorize';
export const OAUTH_CONSENT_PAGE = '/oauth/consent';

/** A connection granted on the consent page: audited by the caller (core `recordConnectedAppGrant`). */
export interface GrantedConnection {
  readonly userId: string;
  readonly organizationId: string;
  readonly clientId: string;
}

export interface McpOAuthDeps {
  readonly env: Pick<Env, 'MCP_OAUTH_ACCESS_TOKEN_TTL_SECONDS' | 'MCP_OAUTH_REFRESH_TOKEN_TTL_DAYS'>;
  readonly settings: McpOAuthSettings & { readonly resource: string };
  readonly lookups: ConsentGateLookups;
  readonly onGranted: (grant: GrantedConnection) => Promise<void>;
}

const DAY_SECONDS = 24 * 60 * 60;
const never = () => false;

/**
 * Better Auth's MCP authorization server (OAuth 2.1 with PKCE, RFC 8414 / 9728 discovery, RFC 7591 registration, RFC
 * 8707 resource binding). Opaque access tokens, short-lived and checked against the database on every call, so a
 * revoked connection stops at once. The organization a token acts in is the consent's reference: the active
 * organization of the person when they accepted, after the gates in `mcpOAuthHooks`.
 */
export function mcpOAuthPlugin({ env, settings, lookups }: McpOAuthDeps) {
  return mcp({
    resource: settings.resource,
    loginPage: OAUTH_AUTHORIZE_PAGE,
    consentPage: OAUTH_CONSENT_PAGE,
    scopes: [...MCP_OAUTH_SCOPES],
    grantTypes: ['authorization_code', 'refresh_token'],
    // Opaque tokens only: no JWT signing keys to manage, revocation takes effect on the next call.
    disableJwtPlugin: true,
    storeTokens: { hash: hashConnectedAppToken },
    prefix: { opaqueAccessToken: CONNECTED_APP_ACCESS_TOKEN_PREFIX, refreshToken: CONNECTED_APP_REFRESH_TOKEN_PREFIX, clientSecret: CONNECTED_APP_CLIENT_SECRET_PREFIX },
    accessTokenExpiresIn: env.MCP_OAUTH_ACCESS_TOKEN_TTL_SECONDS,
    refreshTokenExpiresIn: env.MCP_OAUTH_REFRESH_TOKEN_TTL_DAYS * DAY_SECONDS,
    codeExpiresIn: 600,
    // MCP clients register themselves (Claude does); the callback allowlist is what keeps registration safe.
    allowDynamicClientRegistration: true,
    allowUnauthenticatedClientRegistration: true,
    clientRegistrationDefaultApplicationType: 'infer',
    validateRedirectUri: (uri, _registered, defaultResult) => defaultResult && settings.allowsRedirect(uri),
    // Nobody manages OAuth clients or resources through Better Auth's CRUD endpoints (they are also not routed).
    clientPrivileges: never,
    resourcePrivileges: never,
    postLogin: {
      page: OAUTH_AUTHORIZE_PAGE,
      // The organization is chosen on the consent page, never on a separate step.
      shouldRedirect: never,
      consentReferenceId: async ({ user, session }) => {
        const organizationId: unknown = session.activeOrganizationId;
        if (typeof organizationId !== 'string' || organizationId === '') return undefined;
        return isRole(await lookups.roleOf(user.id, organizationId)) ? organizationId : undefined;
      },
    },
    rateLimit: { token: { window: 60, max: 60 }, register: { window: 60, max: 10 } },
  });
}

const sessionSubject = async (ctx: Parameters<Parameters<typeof createAuthMiddleware>[0]>[0]) => {
  const session = await getSessionFromCtx(ctx);
  if (!session) return null;
  const user = session.user as { id: string; emailVerified: boolean; twoFactorEnabled?: boolean | null };
  const active: unknown = session.session.activeOrganizationId;
  return { userId: user.id, emailVerified: user.emailVerified, twoFactorEnabled: user.twoFactorEnabled === true, activeOrganizationId: typeof active === 'string' && active !== '' ? active : null };
};

const accepts = (body: unknown): boolean => typeof body === 'object' && body !== null && (body as { accept?: unknown }).accept === true;

/**
 * `before`: a registration with a callback outside the allowlist is refused; an accepted consent must pass the same
 * gates as the web session. `after`: an accepted consent that issued a code is audited.
 */
export function mcpOAuthHooks({ settings, lookups, onGranted }: Pick<McpOAuthDeps, 'settings' | 'lookups' | 'onGranted'>) {
  const before = async (ctx: Parameters<Parameters<typeof createAuthMiddleware>[0]>[0]): Promise<void> => {
    if (ctx.path === '/oauth2/register') {
      const reason = registrationRefusal(ctx.body, settings.allowsRedirect);
      if (reason) throw new APIError('BAD_REQUEST', { error: 'invalid_redirect_uri', error_description: reason });
    }
    if (ctx.path === '/oauth2/consent' && accepts(ctx.body)) {
      const refusal = await consentRefusal(await sessionSubject(ctx), lookups);
      if (refusal) throw new APIError(refusal.code === 'UNAUTHORIZED' ? 'UNAUTHORIZED' : 'FORBIDDEN', { code: refusal.code, message: refusal.message });
    }
  };
  const after = createAuthMiddleware(async (ctx) => {
    if (ctx.path !== '/oauth2/consent') return;
    const clientId = grantedClientOf(ctx.body, ctx.context.returned);
    if (clientId === null) return;
    const subject = await sessionSubject(ctx);
    if (!subject?.activeOrganizationId) return;
    await onGranted({ userId: subject.userId, organizationId: subject.activeOrganizationId, clientId });
  });
  return { before, after };
}
