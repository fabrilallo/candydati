import { z } from 'zod';
import { grantablePermissions } from './machine-access.js';
import { ROLES, type Permission, type Role } from './permissions.js';

/**
 * A connected app is an MCP client (Claude, ...) a person authorized with OAuth for one organization. It acts for that
 * person with their role, never more, and never with what no machine may do (machine-access.ts).
 *
 * Token formats: distinct from API keys (`candydati_<8>_<32>`), so the MCP endpoint tells them apart without a lookup.
 */
export const CONNECTED_APP_ACCESS_TOKEN_PREFIX = 'candydati_oat_';
export const CONNECTED_APP_REFRESH_TOKEN_PREFIX = 'candydati_ort_';
export const CONNECTED_APP_CLIENT_SECRET_PREFIX = 'candydati_ocs_';

/** The scope of the MCP resource: what the app may do comes from the person's role, not from scopes. */
export const MCP_OAUTH_SCOPE = 'mcp';
/**
 * Opt-in on top of the role: proposing a move (`propose_stage_move`), which a person then confirms or dismisses. The
 * consent page leaves it unchecked; without it the app cannot propose, whatever the role.
 */
export const MCP_OAUTH_PROPOSE_MOVE_SCOPE = 'candidate:propose_move' satisfies Permission;
export const MCP_OAUTH_SCOPES = [MCP_OAUTH_SCOPE, MCP_OAUTH_PROPOSE_MOVE_SCOPE, 'offline_access'] as const;

/** Permissions a connected app holds only when the person granted the scope of the same name on the consent page. */
export const CONNECTED_APP_OPT_IN_PERMISSIONS: readonly Permission[] = [MCP_OAUTH_PROPOSE_MOVE_SCOPE];

/**
 * What a connected app may do: the person's role minus what no machine may do, minus the opt-in permissions whose scope
 * the grant does not carry.
 */
export function connectedAppPermissions(role: Role, grantedScopes: readonly string[]): readonly Permission[] {
  return grantablePermissions(role, 'connected_app').filter(
    (permission) => !CONNECTED_APP_OPT_IN_PERMISSIONS.includes(permission) || grantedScopes.includes(permission),
  );
}

const ACCESS_TOKEN_PATTERN = new RegExp(`^${CONNECTED_APP_ACCESS_TOKEN_PREFIX}[0-9A-Za-z]{32,128}$`);

export const isConnectedAppAccessToken = (value: unknown): value is string => typeof value === 'string' && ACCESS_TOKEN_PATTERN.test(value);

/** One authorization (grant) of an app by a person in an organization, as the settings list shows it. */
export const connectedAppSchema = z.object({
  /** Grant id: what revocation names. */
  id: z.string().min(1),
  clientId: z.string().min(1),
  /** Self-declared by the app at registration: shown as a claim, never trusted as an identity. */
  clientName: z.string().nullable(),
  clientUri: z.string().nullable(),
  userId: z.string().min(1),
  userName: z.string().nullable(),
  scopes: z.array(z.string()),
  connectedAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type ConnectedApp = z.infer<typeof connectedAppSchema>;

/** The signed authorization request the consent page received, sent back as is. */
export const consentPreviewRequestSchema = z.object({ oauthQuery: z.string().min(1).max(8192) });

/** What the consent page shows: who asks, where the answer goes, and the organizations the person may pick. */
export const consentPreviewSchema = z.object({
  client: z.object({
    clientId: z.string().min(1),
    name: z.string().nullable(),
    uri: z.string().nullable(),
    icon: z.string().nullable(),
    /** Where the browser goes after the answer: the page shows its host. */
    redirectUri: z.string().min(1),
  }),
  scopes: z.array(z.string()),
  organizations: z.array(
    z.object({
      id: z.string().min(1),
      name: z.string(),
      role: z.enum(ROLES),
      /** The organization active in the web session. */
      active: z.boolean(),
      /** The organization requires 2FA of this role and the person has none: no connection until they enrol. */
      twoFactorRequired: z.boolean(),
    }),
  ),
});
export type ConsentPreview = z.infer<typeof consentPreviewSchema>;
