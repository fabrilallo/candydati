import { createHash } from 'node:crypto';
import { CONNECTED_APP_ACCESS_TOKEN_PREFIX, connectedAppPermissions, isConnectedAppAccessToken, MCP_OAUTH_SCOPE } from '@candydati/domain';
import type { DelegatedActor } from '../../actor.js';
import type { ConnectedAppAuthDeps, ConnectedAppToken } from '../../connected-app-ports.js';
import { suspendedByTwoFactor } from '../api-keys/authenticate-api-key.js';

/** How Better Auth stores an opaque token (configured explicitly, so the lookup does not depend on its internals). */
export const hashConnectedAppToken = (token: string): string => createHash('sha256').update(token).digest('base64url');

/** Live, issued for this MCP resource (RFC 8707 audience) with the MCP scope, by a client still enabled. */
const usable = (token: ConnectedAppToken, deps: Pick<ConnectedAppAuthDeps, 'now' | 'resource'>): boolean =>
  token.expiresAt.getTime() > deps.now().getTime() &&
  token.resources.includes(deps.resource) &&
  token.scopes.includes(MCP_OAUTH_SCOPE) &&
  !token.clientDisabled;

/**
 * Turns a presented OAuth access token into the actor it stands for, or null (a 401 for the caller, never a reason).
 * Dead when malformed, unknown, expired, issued for another audience, its grant revoked, its client disabled, or its
 * person no longer a member. The role is read now: a connected app acts with what the person may do today, minus what
 * no machine may do (`connected_app` is on the machine forbidden list), and is suspended like the person's keys when the
 * organization requires 2FA they have not turned on. Opt-in permissions (proposing a move) need their scope on the token.
 */
export async function authenticateConnectedApp(deps: ConnectedAppAuthDeps, presented: string): Promise<DelegatedActor | null> {
  if (!isConnectedAppAccessToken(presented)) return null;
  const token = await deps.connectedApps.findAccessToken(deps.hash(presented.slice(CONNECTED_APP_ACCESS_TOKEN_PREFIX.length)));
  if (!token || !usable(token, deps)) return null;
  const role = await deps.memberRoles.roleOf(token.organizationId, token.userId);
  if (role === null) return null;
  if (await suspendedByTwoFactor(deps, token.organizationId, token.userId, role)) return null;
  return { type: 'connected_app', id: token.grantId, organizationId: token.organizationId, role, onBehalfOfUserId: token.userId, scopes: connectedAppPermissions(role, token.scopes) };
}
