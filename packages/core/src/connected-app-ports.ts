import type { MemberRoleLookup } from './api-key-ports.js';
import type { CoreDeps } from './ports.js';
import type { SecuritySettingsRepository, TwoFactorLookup } from './security-ports.js';

/**
 * One authorization of an OAuth client (an MCP app such as Claude) by a person, in one organization. Better Auth stores it
 * as a consent whose reference is the organization; the access and refresh tokens of the same (client, person,
 * organization) live as long as it does.
 */
export interface ConnectedAppGrant {
  readonly id: string;
  readonly organizationId: string;
  readonly clientId: string;
  /** Declared by the app when it registered itself: a claim, not an identity. */
  readonly clientName: string | null;
  readonly clientUri: string | null;
  readonly userId: string;
  readonly scopes: readonly string[];
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/** A stored access token with the grant it belongs to. Absent when the grant is gone (revoked). */
export interface ConnectedAppToken {
  readonly grantId: string;
  readonly organizationId: string;
  readonly clientId: string;
  readonly userId: string;
  readonly scopes: readonly string[];
  /** RFC 8707 audiences the token was issued for. */
  readonly resources: readonly string[];
  readonly expiresAt: Date;
  readonly clientDisabled: boolean;
}

/** A registered OAuth client, as the consent page shows it. */
export interface ConnectedAppClient {
  readonly clientId: string;
  readonly name: string | null;
  readonly uri: string | null;
  readonly icon: string | null;
  readonly redirectUris: readonly string[];
}

/** A person's membership, with the organization's name and the stored role (validated by the caller). */
export interface Membership {
  readonly organizationId: string;
  readonly organizationName: string;
  readonly role: string;
}

export interface ConnectedAppRepository {
  /** A registered client, or null (unknown or disabled). */
  findClient(clientId: string): Promise<ConnectedAppClient | null>;
  /** Every organization the person belongs to: the consent page lets them pick one. */
  membershipsOf(userId: string): Promise<readonly Membership[]>;
  /**
   * Across organizations, by the hash of a presented access token: the token is what tells which organization it acts
   * in. Only tokens whose grant (consent) still exists are returned.
   */
  findAccessToken(tokenHash: string): Promise<ConnectedAppToken | null>;
  /** Grants of the organization, newest first; of one person only when `userId` is given. */
  list(organizationId: string, userId: string | null): Promise<readonly ConnectedAppGrant[]>;
  findById(organizationId: string, id: string): Promise<ConnectedAppGrant | null>;
  findGrant(organizationId: string, clientId: string, userId: string): Promise<ConnectedAppGrant | null>;
  /** Deletes the grant with every access and refresh token of its (client, person, organization). */
  revoke(grant: ConnectedAppGrant): Promise<void>;
}

export interface ConnectedAppDeps extends CoreDeps {
  readonly connectedApps: ConnectedAppRepository;
}

export interface ConnectedAppAuthDeps {
  readonly connectedApps: Pick<ConnectedAppRepository, 'findAccessToken'>;
  readonly memberRoles: MemberRoleLookup;
  readonly securitySettings: Pick<SecuritySettingsRepository, 'get'>;
  readonly twoFactor: TwoFactorLookup;
  /** How the authorization server stores a token (without its prefix): SHA-256, base64url. */
  readonly hash: (token: string) => string;
  readonly now: () => Date;
  /** The canonical MCP resource URL a token must have been issued for (its audience). */
  readonly resource: string;
}
