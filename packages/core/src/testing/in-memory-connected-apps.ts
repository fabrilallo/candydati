import type { ConnectedAppClient, ConnectedAppGrant, ConnectedAppRepository, ConnectedAppToken, Membership } from '../connected-app-ports.js';
import { cell } from './in-memory-transaction.js';

/** A stored token row: what Better Auth writes, keyed by the hash of the token. */
export interface StoredConnectedAppToken extends Omit<ConnectedAppToken, 'grantId' | 'clientDisabled'> {
  readonly hash: string;
}

export interface InMemoryConnectedApps extends ConnectedAppRepository {
  addClient(client: ConnectedAppClient): void;
  addMembership(userId: string, membership: Membership): void;
  addGrant(grant: ConnectedAppGrant): void;
  addToken(token: StoredConnectedAppToken): void;
  disableClient(clientId: string): void;
  grants(): readonly ConnectedAppGrant[];
  tokens(): readonly StoredConnectedAppToken[];
}

const sameGrant = (token: Pick<StoredConnectedAppToken, 'organizationId' | 'clientId' | 'userId'>, grant: ConnectedAppGrant): boolean =>
  token.organizationId === grant.organizationId && token.clientId === grant.clientId && token.userId === grant.userId;

export function createInMemoryConnectedApps(): InMemoryConnectedApps {
  const grants = cell<readonly ConnectedAppGrant[]>([]);
  const tokens = cell<readonly StoredConnectedAppToken[]>([]);
  const disabled = cell<readonly string[]>([]);
  const clients = cell<readonly ConnectedAppClient[]>([]);
  const memberships = cell<readonly (Membership & { readonly userId: string })[]>([]);
  const newestFirst = (a: ConnectedAppGrant, b: ConnectedAppGrant) => b.createdAt.getTime() - a.createdAt.getTime();
  return {
    async findAccessToken(tokenHash) {
      const token = tokens.get().find((row) => row.hash === tokenHash);
      const grant = token ? grants.get().find((row) => sameGrant(token, row)) : undefined;
      if (!token || !grant) return null;
      const { hash: _hash, ...rest } = token;
      return { ...rest, grantId: grant.id, clientDisabled: disabled.get().includes(token.clientId) };
    },
    async list(organizationId, userId) {
      return grants
        .get()
        .filter((row) => row.organizationId === organizationId && (userId === null || row.userId === userId))
        .toSorted(newestFirst);
    },
    async findById(organizationId, id) {
      return grants.get().find((row) => row.organizationId === organizationId && row.id === id) ?? null;
    },
    async findGrant(organizationId, clientId, userId) {
      return grants.get().find((row) => row.organizationId === organizationId && row.clientId === clientId && row.userId === userId) ?? null;
    },
    async revoke(grant) {
      grants.set(grants.get().filter((row) => row.id !== grant.id));
      tokens.set(tokens.get().filter((row) => !sameGrant(row, grant)));
    },
    async findClient(clientId) {
      return disabled.get().includes(clientId) ? null : (clients.get().find((row) => row.clientId === clientId) ?? null);
    },
    async membershipsOf(userId) {
      return memberships.get().filter((row) => row.userId === userId).map(({ userId: _userId, ...membership }) => membership);
    },
    addClient: (client) => clients.set([...clients.get(), client]),
    addMembership: (userId, membership) => memberships.set([...memberships.get(), { ...membership, userId }]),
    addGrant: (grant) => grants.set([...grants.get(), grant]),
    addToken: (token) => tokens.set([...tokens.get(), token]),
    disableClient: (clientId) => disabled.set([...disabled.get(), clientId]),
    grants: () => grants.get(),
    tokens: () => tokens.get(),
  };
}

