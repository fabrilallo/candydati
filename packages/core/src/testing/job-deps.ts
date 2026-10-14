import type { JobDeps } from '../job-ports.js';
import { createInMemoryJobApprovals, createInMemoryOrganizationSettings } from './in-memory-job-requests.js';
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
  type InMemoryJobRepository,
  createInMemoryJobRepository,
  createInMemoryJobTemplateRepository,
  createInMemoryOrganizationDirectory,
} from './in-memory-jobs.js';
import { createInMemoryJobTeams, type InMemoryJobTeams } from './in-memory-job-teams.js';
import { createInMemoryTransaction } from './in-memory-transaction.js';

/** Fully in-memory `JobDeps` with a counter-based id generator and a fixed clock. */
export type TestJobDeps = JobDeps & {
  readonly auditLog: InMemoryAuditLog;
  readonly outbox: InMemoryOutbox;
  readonly automationRules: InMemoryAutomationRules;
  readonly jobTeams: InMemoryJobTeams;
};

export function createTestJobDeps(overrides: Partial<TestJobDeps> = {}): TestJobDeps {
  let counter = 0;
  const organizationSettings = overrides.organizationSettings ?? createInMemoryOrganizationSettings();
  // Like the migration backfill: the creator of each seeded job is on its team.
  const seeded = (overrides.jobs as Partial<InMemoryJobRepository> | undefined)?.snapshot?.() ?? [];
  const team = seeded.map((job) => ({ organizationId: job.organizationId, jobId: job.id, userId: job.createdBy, role: 'recruiter' as const, addedBy: 'system', createdAt: job.createdAt }));
  return {
    auditLog: createInMemoryAuditLog(),
    jobTeams: createInMemoryJobTeams(team, { settings: organizationSettings }),
    transaction: createInMemoryTransaction(),
    jobs: createInMemoryJobRepository(),
    jobTemplates: createInMemoryJobTemplateRepository(),
    organizations: createInMemoryOrganizationDirectory(),
    applicationCounts: createInMemoryApplicationCounts(createCandidateStore()),
    privacyNotices: createInMemoryPrivacyNoticeRepository(),
    outbox: createInMemoryOutbox(),
    automationRules: createInMemoryAutomationRules(),
    approvals: createInMemoryJobApprovals(),
    organizationSettings,
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
