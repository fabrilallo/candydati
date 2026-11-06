import type { Candidate, SourcedContact } from '@candydati/domain';
import { normalizeProfileUrl } from '@candydati/domain';
import type { SourcedContactRepository, SourcingCandidateLookup, SourcingObjectionRepository, SourcingRiskAcceptanceRepository } from '../sourcing-ports.js';
import { cell } from './in-memory-transaction.js';

export interface InMemorySourcedContacts extends SourcedContactRepository {
  snapshot(): readonly SourcedContact[];
}

export function createInMemorySourcedContacts(initial: readonly SourcedContact[] = []): InMemorySourcedContacts {
  const rows = cell<readonly SourcedContact[]>([...initial]);
  const inOrg = (organizationId: string) => rows.get().filter((c) => c.organizationId === organizationId);
  return {
    async create(contact) {
      if (inOrg(contact.organizationId).some((c) => c.jobId === contact.jobId && c.profileKey === contact.profileKey)) throw new Error('duplicate sourced contact');
      rows.set([...rows.get(), contact]);
      return contact;
    },
    async findById(organizationId, id) {
      return inOrg(organizationId).find((c) => c.id === id) ?? null;
    },
    async listByJob(organizationId, jobId) {
      return inOrg(organizationId)
        .filter((c) => c.jobId === jobId)
        .toSorted((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    },
    async findMatching(organizationId, { profileKeys, emails }) {
      return inOrg(organizationId).filter((c) => profileKeys.includes(c.profileKey) || (c.email !== null && emails.includes(c.email)));
    },
    async update(organizationId, id, patch) {
      const found = inOrg(organizationId).find((c) => c.id === id);
      if (!found) return null;
      const next = { ...found, ...patch };
      rows.set(rows.get().map((c) => (c === found ? next : c)));
      return next;
    },
    async delete(organizationId, id) {
      const exists = inOrg(organizationId).some((c) => c.id === id);
      rows.set(rows.get().filter((c) => !(c.organizationId === organizationId && c.id === id)));
      return exists;
    },
    async findByNoticeHash(tokenHash) {
      return rows.get().find((c) => c.noticeTokenHash === tokenHash) ?? null;
    },
    async deleteExpired(now) {
      const doomed = rows.get().filter((c) => c.expiresAt.getTime() <= now.getTime());
      rows.set(rows.get().filter((c) => !doomed.includes(c)));
      return doomed.length;
    },
    snapshot: () => rows.get(),
  };
}

export interface InMemorySourcingObjections extends SourcingObjectionRepository {
  snapshot(): readonly { readonly organizationId: string; readonly fingerprint: string }[];
}

export function createInMemorySourcingObjections(): InMemorySourcingObjections {
  const rows = cell<readonly { readonly organizationId: string; readonly fingerprint: string }[]>([]);
  return {
    async existing(organizationId, fingerprints) {
      return new Set(rows.get().filter((r) => r.organizationId === organizationId && fingerprints.includes(r.fingerprint)).map((r) => r.fingerprint));
    },
    async add(organizationId, fingerprints) {
      const known = new Set(rows.get().filter((r) => r.organizationId === organizationId).map((r) => r.fingerprint));
      rows.set([...rows.get(), ...[...new Set(fingerprints)].filter((f) => !known.has(f)).map((fingerprint) => ({ organizationId, fingerprint }))]);
    },
    snapshot: () => rows.get(),
  };
}

/** Over the candidates of the in-memory world. */
export const createInMemorySourcingCandidateLookup = (candidates: () => readonly Candidate[]): SourcingCandidateLookup => ({
  async findMatching(organizationId, { profileKeys, emails }) {
    return candidates().filter(
      (c) => c.organizationId === organizationId && (emails.includes(c.email.toLowerCase()) || (c.linkedinUrl !== null && profileKeys.includes(normalizeProfileUrl(c.linkedinUrl) ?? ''))),
    );
  },
});

export function createInMemoryRiskAcceptances(): SourcingRiskAcceptanceRepository {
  const rows = cell<Readonly<Record<string, { readonly textVersion: number; readonly acceptedAt: Date }>>>({});
  return {
    async find(organizationId, userId) {
      return rows.get()[`${organizationId}\u0000${userId}`] ?? null;
    },
    async accept(organizationId, userId, textVersion, at) {
      rows.set({ ...rows.get(), [`${organizationId}\u0000${userId}`]: { textVersion, acceptedAt: at } });
    },
  };
}
