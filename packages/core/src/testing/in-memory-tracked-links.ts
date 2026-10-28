import type { TrackedLink } from '@candydati/domain';
import type { TrackedLinkRepository } from '../tracked-link-ports.js';
import { cell } from './in-memory-transaction.js';

export interface InMemoryTrackedLinks extends TrackedLinkRepository {
  snapshot(): readonly TrackedLink[];
}

const ofJob = (link: TrackedLink, organizationId: string, jobId: string): boolean => link.organizationId === organizationId && link.jobId === jobId;

export function createInMemoryTrackedLinks(initial: readonly TrackedLink[] = []): InMemoryTrackedLinks {
  const rows = cell<readonly TrackedLink[]>([...initial]);
  return {
    async listByJob(organizationId, jobId) {
      return rows
        .get()
        .filter((link) => ofJob(link, organizationId, jobId))
        .toSorted((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id));
    },
    async countByJob(organizationId, jobId) {
      return rows.get().filter((link) => ofJob(link, organizationId, jobId)).length;
    },
    async insertIfAbsent(link) {
      const existing = rows.get().find((row) => ofJob(row, link.organizationId, link.jobId) && row.source === link.source && row.campaign === link.campaign);
      if (existing) return { link: existing, created: false };
      rows.set([...rows.get(), link]);
      return { link, created: true };
    },
    async remove(organizationId, jobId, linkId) {
      const before = rows.get();
      rows.set(before.filter((link) => !(ofJob(link, organizationId, jobId) && link.id === linkId)));
      return rows.get().length !== before.length;
    },
    snapshot: () => rows.get(),
  };
}
