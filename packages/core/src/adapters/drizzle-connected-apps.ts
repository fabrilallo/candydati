import { and, asc, desc, eq, isNull, schema } from '@candydati/db';
import { strongestRole } from './drizzle-api-keys.js';
import type { ConnectedAppGrant, ConnectedAppRepository } from '../connected-app-ports.js';
import type { DbExecutor } from './db-executor.js';

const { oauthConsent, oauthClient, oauthAccessToken, oauthRefreshToken, member, organization } = schema;

const grantColumns = {
  id: oauthConsent.id,
  organizationId: oauthConsent.referenceId,
  clientId: oauthConsent.clientId,
  clientName: oauthClient.name,
  clientUri: oauthClient.uri,
  userId: oauthConsent.userId,
  scopes: oauthConsent.scopes,
  createdAt: oauthConsent.createdAt,
  updatedAt: oauthConsent.updatedAt,
};

type GrantRow = { [K in keyof typeof grantColumns]: (typeof grantColumns)[K]['_']['data'] | null };

/** A consent row without an organization or a person is not a grant of ours (Better Auth never writes one here). */
const toGrant = (row: GrantRow): ConnectedAppGrant | null => {
  if (!row.id || !row.organizationId || !row.clientId || !row.userId) return null;
  const at = row.createdAt ?? new Date(0);
  return { id: row.id, organizationId: row.organizationId, clientId: row.clientId, clientName: row.clientName, clientUri: row.clientUri, userId: row.userId, scopes: row.scopes ?? [], createdAt: at, updatedAt: row.updatedAt ?? at };
};

const grants = (rows: readonly GrantRow[]): readonly ConnectedAppGrant[] => rows.map(toGrant).filter((grant): grant is ConnectedAppGrant => grant !== null);

/**
 * The OAuth tables Better Auth writes, read as grants: a consent (client, person, organization) and its tokens. Every
 * query but the token lookup is filtered by the organization (`reference_id`).
 */
export function createDrizzleConnectedApps(db: DbExecutor): ConnectedAppRepository {
  const selectGrants = () => db.select(grantColumns).from(oauthConsent).innerJoin(oauthClient, eq(oauthClient.clientId, oauthConsent.clientId));
  const inOrg = (organizationId: string) => eq(oauthConsent.referenceId, organizationId);
  return {
    async findClient(clientId) {
      const [row] = await db
        .select({ clientId: oauthClient.clientId, name: oauthClient.name, uri: oauthClient.uri, icon: oauthClient.icon, redirectUris: oauthClient.redirectUris, disabled: oauthClient.disabled })
        .from(oauthClient)
        .where(eq(oauthClient.clientId, clientId))
        .limit(1);
      if (!row || row.disabled === true) return null;
      return { clientId: row.clientId, name: row.name, uri: row.uri, icon: row.icon, redirectUris: row.redirectUris };
    },
    async membershipsOf(userId) {
      return db
        .select({ organizationId: member.organizationId, organizationName: organization.name, role: member.role })
        .from(member)
        .innerJoin(organization, eq(organization.id, member.organizationId))
        .where(eq(member.userId, userId))
        .orderBy(asc(organization.name), asc(organization.id))
        .then((rows) => rows.map((row) => ({ ...row, role: strongestRole(row.role) ?? row.role })));
    },
    async findAccessToken(tokenHash) {
      const [row] = await db
        .select({
          grantId: oauthConsent.id,
          organizationId: oauthAccessToken.referenceId,
          clientId: oauthAccessToken.clientId,
          userId: oauthAccessToken.userId,
          scopes: oauthAccessToken.scopes,
          resources: oauthAccessToken.resources,
          expiresAt: oauthAccessToken.expiresAt,
          revoked: oauthAccessToken.revoked,
          clientDisabled: oauthClient.disabled,
        })
        .from(oauthAccessToken)
        .innerJoin(oauthClient, eq(oauthClient.clientId, oauthAccessToken.clientId))
        // The grant must still exist: revoking it ends every token at once.
        .innerJoin(oauthConsent, and(eq(oauthConsent.clientId, oauthAccessToken.clientId), eq(oauthConsent.userId, oauthAccessToken.userId), eq(oauthConsent.referenceId, oauthAccessToken.referenceId)))
        .where(and(eq(oauthAccessToken.token, tokenHash), isNull(oauthAccessToken.revoked)))
        .limit(1);
      if (!row?.organizationId || !row.userId || !row.expiresAt) return null;
      return {
        grantId: row.grantId,
        organizationId: row.organizationId,
        clientId: row.clientId,
        userId: row.userId,
        scopes: row.scopes,
        resources: row.resources ?? [],
        expiresAt: row.expiresAt,
        clientDisabled: row.clientDisabled === true,
      };
    },
    async list(organizationId, userId) {
      const where = userId === null ? inOrg(organizationId) : and(inOrg(organizationId), eq(oauthConsent.userId, userId));
      return grants(await selectGrants().where(where).orderBy(desc(oauthConsent.createdAt), desc(oauthConsent.id)));
    },
    async findById(organizationId, id) {
      return grants(await selectGrants().where(and(inOrg(organizationId), eq(oauthConsent.id, id))).limit(1))[0] ?? null;
    },
    async findGrant(organizationId, clientId, userId) {
      const where = and(inOrg(organizationId), eq(oauthConsent.clientId, clientId), eq(oauthConsent.userId, userId));
      return grants(await selectGrants().where(where).limit(1))[0] ?? null;
    },
    async revoke(grant) {
      const sameGrant = <T extends typeof oauthAccessToken | typeof oauthRefreshToken | typeof oauthConsent>(table: T) =>
        and(eq(table.clientId, grant.clientId), eq(table.userId, grant.userId), eq(table.referenceId, grant.organizationId));
      // Access tokens first: they reference refresh tokens.
      await db.delete(oauthAccessToken).where(sameGrant(oauthAccessToken));
      await db.delete(oauthRefreshToken).where(sameGrant(oauthRefreshToken));
      await db.delete(oauthConsent).where(sameGrant(oauthConsent));
    },
  };
}
