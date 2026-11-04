import { publicJobClientOf, type Client, type ClientShortlist, type ClientShortlistItem, type JobClientLink, type PublicJobClientDto } from '@candydati/domain';
import type { ClientRepository, JobClientRepository, PublicJobClientDirectory, ShortlistRepository } from '../client-ports.js';
import { ConflictError } from '../errors.js';
import type { OrganizationSettingsRepository } from '../job-request-ports.js';
import { cell, type Cell } from './in-memory-transaction.js';

export interface ClientStoreState {
  readonly clients: readonly Client[];
  readonly links: readonly JobClientLink[];
  readonly shortlists: readonly ClientShortlist[];
  readonly items: readonly ClientShortlistItem[];
}

export type ClientStore = Cell<ClientStoreState>;

export const createClientStore = (initial: Partial<ClientStoreState> = {}): ClientStore =>
  cell<ClientStoreState>({ clients: [], links: [], shortlists: [], items: [], ...initial });

const update = (store: ClientStore, next: Partial<ClientStoreState>): void => store.set({ ...store.get(), ...next });

const sameName = (a: string, b: string): boolean => a.toLowerCase() === b.toLowerCase();

export function createInMemoryClients(store: ClientStore): ClientRepository {
  const inOrg = (organizationId: string) => store.get().clients.filter((c) => c.organizationId === organizationId);
  const taken = (organizationId: string, name: string, exceptId: string | null) => inOrg(organizationId).some((c) => c.id !== exceptId && sameName(c.name, name));
  const replace = (next: Client): Client => {
    update(store, { clients: store.get().clients.map((c) => (c.organizationId === next.organizationId && c.id === next.id ? next : c)) });
    return next;
  };
  return {
    async list(organizationId, { includeArchived }) {
      return inOrg(organizationId)
        .filter((c) => includeArchived || c.archivedAt === null)
        .toSorted((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
    },
    async findById(organizationId, id) {
      return inOrg(organizationId).find((c) => c.id === id) ?? null;
    },
    async create(client) {
      if (taken(client.organizationId, client.name, null)) throw new ConflictError('client_name_taken');
      update(store, { clients: [...store.get().clients, client] });
      return client;
    },
    async update(organizationId, id, patch) {
      const current = inOrg(organizationId).find((c) => c.id === id);
      if (!current) return null;
      if (taken(organizationId, patch.name, id)) throw new ConflictError('client_name_taken');
      return replace({ ...current, ...patch });
    },
    async setArchived(organizationId, id, archivedAt, updatedAt) {
      const current = inOrg(organizationId).find((c) => c.id === id);
      return current ? replace({ ...current, archivedAt, updatedAt }) : null;
    },
  };
}

export function createInMemoryJobClients(store: ClientStore): JobClientRepository {
  const inOrg = (organizationId: string) => store.get().links.filter((l) => l.organizationId === organizationId);
  return {
    async findByJob(organizationId, jobId) {
      return inOrg(organizationId).find((l) => l.jobId === jobId) ?? null;
    },
    async listByJobs(organizationId, jobIds) {
      return inOrg(organizationId).filter((l) => jobIds.includes(l.jobId));
    },
    async listJobIdsByClient(organizationId, clientId) {
      return inOrg(organizationId)
        .filter((l) => l.clientId === clientId)
        .map((l) => l.jobId);
    },
    async countByClient(organizationId) {
      const counts: Record<string, number> = {};
      for (const link of inOrg(organizationId)) counts[link.clientId] = (counts[link.clientId] ?? 0) + 1;
      return counts;
    },
    async set(link) {
      update(store, { links: [...store.get().links.filter((l) => l.jobId !== link.jobId), link] });
    },
    async remove(organizationId, jobId) {
      update(store, { links: store.get().links.filter((l) => !(l.organizationId === organizationId && l.jobId === jobId)) });
    },
  };
}

export function createInMemoryPublicJobClients(store: ClientStore, settings: OrganizationSettingsRepository): PublicJobClientDirectory {
  return {
    async forJobs(organizationId, jobIds) {
      const { agencyAuthorization } = await settings.get(organizationId);
      const entries: [string, PublicJobClientDto][] = [];
      for (const link of store.get().links.filter((l) => l.organizationId === organizationId && jobIds.includes(l.jobId))) {
        const client = store.get().clients.find((c) => c.organizationId === organizationId && c.id === link.clientId);
        if (client) entries.push([link.jobId, publicJobClientOf(client, link.display, agencyAuthorization)]);
      }
      return Object.fromEntries(entries);
    },
  };
}

export function createInMemoryShortlists(store: ClientStore): ShortlistRepository {
  const lists = (organizationId: string) => store.get().shortlists.filter((s) => s.organizationId === organizationId);
  const items = (organizationId: string) => store.get().items.filter((i) => i.organizationId === organizationId);
  const patchList = (organizationId: string, id: string, guard: (s: ClientShortlist) => boolean, patch: Partial<ClientShortlist>): ClientShortlist | null => {
    const current = lists(organizationId).find((s) => s.id === id);
    if (!current || !guard(current)) return null;
    const next = { ...current, ...patch };
    update(store, { shortlists: store.get().shortlists.map((s) => (s === current ? next : s)) });
    return next;
  };
  const byShortlist = (ids: readonly string[]) => (a: ClientShortlistItem, b: ClientShortlistItem) => ids.indexOf(a.shortlistId) - ids.indexOf(b.shortlistId) || a.position - b.position;
  return {
    async create(shortlist, newItems) {
      if (store.get().shortlists.some((s) => s.tokenHash === shortlist.tokenHash)) throw new ConflictError('Token already used.');
      update(store, { shortlists: [...store.get().shortlists, shortlist], items: [...store.get().items, ...newItems] });
    },
    async findById(organizationId, id) {
      return lists(organizationId).find((s) => s.id === id) ?? null;
    },
    async findByTokenHash(tokenHash) {
      return store.get().shortlists.find((s) => s.tokenHash === tokenHash) ?? null;
    },
    async listByJob(organizationId, jobId) {
      return lists(organizationId)
        .filter((s) => s.jobId === jobId)
        .toSorted((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    },
    async listItems(organizationId, shortlistIds) {
      return items(organizationId)
        .filter((i) => shortlistIds.includes(i.shortlistId))
        .toSorted(byShortlist(shortlistIds));
    },
    async listItemsByApplication(organizationId, applicationId) {
      const ids = lists(organizationId)
        .toSorted((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
        .map((s) => s.id);
      return items(organizationId)
        .filter((i) => i.applicationId === applicationId)
        .toSorted(byShortlist(ids));
    },
    async revoke(organizationId, id, at) {
      return patchList(organizationId, id, (s) => s.revokedAt === null, { revokedAt: at }) !== null;
    },
    async markOpened(organizationId, id, at) {
      return patchList(organizationId, id, (s) => s.firstOpenedAt === null, { firstOpenedAt: at }) !== null;
    },
    async answer(organizationId, shortlistId, itemId, write) {
      const current = items(organizationId).find((i) => i.shortlistId === shortlistId && i.id === itemId);
      if (!current || current.answer !== null) return false;
      const next = { ...current, answer: write.answer, answerReason: write.reason, answeredAt: write.at };
      update(store, { items: store.get().items.map((i) => (i === current ? next : i)) });
      return true;
    },
    async markCandidateNotified(organizationId, itemIds, at) {
      update(store, { items: store.get().items.map((i) => (i.organizationId === organizationId && itemIds.includes(i.id) ? { ...i, candidateNotifiedAt: at } : i)) });
    },
    async rotateToken(organizationId, id, expectedTokenHash, patch) {
      return patchList(organizationId, id, (s) => s.tokenHash === expectedTokenHash, patch);
    },
    async listOpenAcrossOrganizations(now) {
      return store.get().shortlists.filter((s) => s.revokedAt === null && s.expiresAt > now);
    },
    async deleteItemsOfApplications(organizationId, applicationIds) {
      update(store, { items: store.get().items.filter((i) => !(i.organizationId === organizationId && applicationIds.includes(i.applicationId))) });
    },
  };
}
