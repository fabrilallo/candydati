import type { PrivacyNotice } from '@tt/domain';
import { ConflictError } from '../errors.js';
import type { PrivacyNoticeRepository } from '../candidate-ports.js';

export function createInMemoryPrivacyNoticeRepository(initial: readonly PrivacyNotice[] = []): PrivacyNoticeRepository {
  let rows: readonly PrivacyNotice[] = [...initial];
  const inOrg = (organizationId: string) => rows.filter((n) => n.organizationId === organizationId).toSorted((a, b) => b.version - a.version);
  return {
    async create(notice) {
      if (inOrg(notice.organizationId).some((n) => n.version === notice.version)) throw new ConflictError('Version already exists.');
      rows = [...rows, notice];
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
