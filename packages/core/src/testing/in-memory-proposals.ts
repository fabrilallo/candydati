import type { MoveProposal } from '@candydati/domain';
import type { MoveProposalRepository } from '../proposal-ports.js';
import { cell } from './in-memory-transaction.js';

export interface InMemoryMoveProposals extends MoveProposalRepository {
  snapshot(): readonly MoveProposal[];
}

const oldestFirst = <T extends { createdAt: Date }>(items: readonly T[]): readonly T[] => items.toSorted((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

export function createInMemoryMoveProposals(initial: readonly MoveProposal[] = []): InMemoryMoveProposals {
  const rows = cell<readonly MoveProposal[]>([...initial]);
  const inOrg = (organizationId: string) => rows.get().filter((p) => p.organizationId === organizationId);
  const replace = (next: MoveProposal) => rows.set(rows.get().map((p) => (p.organizationId === next.organizationId && p.id === next.id ? next : p)));
  return {
    async createIfNoneOpen(proposal) {
      if (inOrg(proposal.organizationId).some((p) => p.applicationId === proposal.applicationId && p.status === 'open')) return null;
      rows.set([...rows.get(), proposal]);
      return proposal;
    },
    async findById(organizationId, id) {
      return inOrg(organizationId).find((p) => p.id === id) ?? null;
    },
    async listOpen(query) {
      return oldestFirst(
        inOrg(query.organizationId).filter(
          (p) =>
            p.status === 'open' &&
            (query.applicationId === undefined || p.applicationId === query.applicationId) &&
            (query.jobIds === undefined || query.jobIds.includes(p.jobId)),
        ),
      ).slice(0, query.limit);
    },
    async resolve(organizationId, id, resolution) {
      const current = inOrg(organizationId).find((p) => p.id === id);
      if (!current || current.status !== 'open') return null;
      const next = { ...current, ...resolution };
      replace(next);
      return next;
    },
    async dropOpenForApplication(organizationId, applicationId, at) {
      const open = inOrg(organizationId).filter((p) => p.applicationId === applicationId && p.status === 'open');
      for (const proposal of open) replace({ ...proposal, status: 'dropped', resolvedAt: at });
      return open.length;
    },
    async expireDue(now) {
      const due = rows.get().filter((p) => p.status === 'open' && p.expiresAt.getTime() <= now.getTime());
      for (const proposal of due) replace({ ...proposal, status: 'expired', resolvedAt: now });
      return due.length;
    },
    snapshot: () => rows.get(),
  };
}
