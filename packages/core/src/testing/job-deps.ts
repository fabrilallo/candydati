import type { JobDeps } from '../job-ports.js';
import { createInMemoryAuditLog, type InMemoryAuditLog } from './in-memory-audit-log.js';
import { fakeAdQualityAnalyzer } from './job-fixtures.js';
import { createCandidateStore, createInMemoryApplicationCounts } from './in-memory-candidates.js';
import { createInMemoryPrivacyNoticeRepository } from './in-memory-privacy.js';
import {
  createInMemoryAutomationRules,
  createInMemoryOutbox,
  type InMemoryAutomationRules,
  type InMemoryOutbox,
} from './in-memory-automation.js';
import {
  createInMemoryJobRepository,
  createInMemoryJobTemplateRepository,
  createInMemoryOrganizationDirectory,
} from './in-memory-jobs.js';

/** Fully in-memory `JobDeps` with a counter-based id generator and a fixed clock. */
export type TestJobDeps = JobDeps & {
  readonly auditLog: InMemoryAuditLog;
  readonly outbox: InMemoryOutbox;
  readonly automationRules: InMemoryAutomationRules;
};

export function createTestJobDeps(overrides: Partial<TestJobDeps> = {}): TestJobDeps {
  let counter = 0;
  return {
    auditLog: createInMemoryAuditLog(),
    jobs: createInMemoryJobRepository(),
    jobTemplates: createInMemoryJobTemplateRepository(),
    organizations: createInMemoryOrganizationDirectory(),
    applicationCounts: createInMemoryApplicationCounts(createCandidateStore()),
    privacyNotices: createInMemoryPrivacyNoticeRepository(),
    outbox: createInMemoryOutbox(),
    automationRules: createInMemoryAutomationRules(),
    adQuality: fakeAdQualityAnalyzer(),
    adQualityThreshold: 6,
    newId: () => {
      counter += 1;
      return `${String(counter).padStart(6, '0')}-id`;
    },
    now: () => new Date('2026-06-01T10:00:00.000Z'),
    ...overrides,
  };
}
