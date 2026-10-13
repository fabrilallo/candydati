import type { PrivacyNotice } from '@tt/domain';
import { ConflictError } from '../errors.js';
import type { PrivacyNoticeRepository } from '../candidate-ports.js';
import { cell } from './in-memory-transaction.js';

export function createInMemoryPrivacyNoticeRepository(initial: readonly PrivacyNotice[] = []): PrivacyNoticeRepository {
  const rows = cell<readonly PrivacyNotice[]>([...initial]);
  const inOrg = (organizationId: string) => rows.get().filter((n) => n.organizationId === organizationId).toSorted((a, b) => b.version - a.version);
  return {
    async create(notice) {
      if (inOrg(notice.organizationId).some((n) => n.version === notice.version)) throw new ConflictError('Version already exists.');
      rows.set([...rows.get(), notice]);
      return notice;
    },
    async findActive(organizationId) {
      return inOrg(organizationId)[0] ?? null;
    },
    async list(organizationId) {
      return inOrg(organizationId);
    },
  };
}
