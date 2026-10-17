import type { CareersPageRecord } from '../careers-ports.js';
import type { SetupProgressDeps } from '../use-cases/setup/get-setup-progress.js';
import { createInMemoryAuditLog } from './in-memory-audit-log.js';
import { createInMemoryTransaction } from './in-memory-transaction.js';

export interface SetupProgressWorldOptions {
  readonly activeNotice?: boolean;
  readonly careersPublished?: boolean;
  readonly jobs?: { readonly draft: number; readonly published: number; readonly closed: number };
  readonly members?: number;
}

/** Setup progress deps in memory, recording which organizations were read. */
export function createSetupProgressWorld(options: SetupProgressWorldOptions = {}): SetupProgressDeps & { organizationsRead(): readonly string[] } {
  const read: string[] = [];
  const note = (organizationId: string): void => {
    if (!read.includes(organizationId)) read.push(organizationId);
  };
  return {
    auditLog: createInMemoryAuditLog(),
    transaction: createInMemoryTransaction(),
    privacyNotices: {
      findActive: async (organizationId) => (note(organizationId), options.activeNotice ? ({ organizationId, version: 1 } as never) : null),
    },
    careersPages: {
      find: async (organizationId) => (note(organizationId), options.careersPublished ? ({ organizationId, publishedAt: new Date('2026-10-17T10:00:00Z') } as unknown as CareersPageRecord) : null),
    },
    jobCounts: { countByStatus: async (organizationId) => (note(organizationId), options.jobs ?? { draft: 0, published: 0, closed: 0 }) },
    members: {
      list: async (organizationId) => (note(organizationId), Array.from({ length: options.members ?? 1 }, (_, i) => ({ userId: `u${i}`, name: `U${i}`, email: `u${i}@example.com`, roles: ['owner'] }))),
    },
    organizationsRead: () => read,
  };
}
