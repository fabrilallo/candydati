import {
  authenticateConnectedApp,
  hashConnectedAppToken,
  recordConnectedAppGrant,
  type ConnectedAppDeps,
  type DelegatedActor,
  type DrizzleUnitOfWork,
} from '@candydati/core';
import { isRole } from '@candydati/domain';
import type { GrantedConnection } from '../auth/mcp-oauth.js';
import type { McpOAuthSettings } from '../auth/mcp-oauth-settings.js';

export interface ConnectedAppWiring {
  /** What the routes read from the app context. */
  readonly context: { readonly mcpOAuth: McpOAuthSettings; readonly connectedAppDeps: ConnectedAppDeps };
  /** OAuth access token -> actor; undefined while OAuth is off (only API keys reach MCP then). */
  readonly authenticateConnectedApp: ((token: string) => Promise<DelegatedActor | null>) | undefined;
  /** Audits a grant made on the consent page, as the person who made it, in the organization they picked. */
  readonly onConnectionGranted: (grant: GrantedConnection) => Promise<void>;
}

export function createConnectedAppWiring(uow: DrizzleUnitOfWork, settings: McpOAuthSettings): ConnectedAppWiring {
  const r = uow.repositories;
  const connectedAppDeps: ConnectedAppDeps = { auditLog: r.auditLog, transaction: uow.transaction, jobTeams: r.jobTeams, connectedApps: r.connectedApps };
  const resource = settings.enabled ? settings.resource : null;
  const authDeps =
    resource === null
      ? null
      : { connectedApps: r.connectedApps, memberRoles: r.memberRoles, securitySettings: r.securitySettings, twoFactor: r.twoFactor, hash: hashConnectedAppToken, now: () => new Date(), resource };
  return {
    context: { mcpOAuth: settings, connectedAppDeps },
    authenticateConnectedApp: authDeps === null ? undefined : (token) => authenticateConnectedApp(authDeps, token),
    onConnectionGranted: async ({ userId, organizationId, clientId }) => {
      const role = await r.memberRoles.roleOf(organizationId, userId);
      // The consent gate checked the membership a moment ago; a person removed since then gets no audit row and no access.
      if (!isRole(role)) return;
      await recordConnectedAppGrant(connectedAppDeps, { type: 'user', id: userId, organizationId, role, onBehalfOfUserId: null }, { clientId });
    },
  };
}
