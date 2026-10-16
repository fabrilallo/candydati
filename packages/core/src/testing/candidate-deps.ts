import type { CandidateDeps, PrivacyDeps } from '../candidate-ports.js';
import type { CvExtractionDeps, SubmitApplicationDeps } from '../intake-ports.js';
import type { JobDeps } from '../job-ports.js';
import type { ReportDeps } from '../report-ports.js';
import { createInMemoryAuditLog, type InMemoryAuditLog } from './in-memory-audit-log.js';
import {
  createCandidateStore,
  createInMemoryApplicationIntake,
  createInMemoryApplicationRepository,
  createInMemoryCandidateNoteRepository,
  createInMemoryCandidateRepository,
  createInMemoryCandidateSearch,
  createInMemoryCvExtractionRepository,
  createInMemoryUserDirectory,
  type CandidateStore,
} from './in-memory-candidates.js';
import { createInMemoryJobViews } from './in-memory-job-views.js';
import type { RecordJobViewDeps } from '../job-view-ports.js';
import { createInMemoryReports, createInMemoryResponsePromises, createInMemoryStageEvents } from './in-memory-reports.js';
import {
  createInMemoryFileStorage,
  createInMemoryTaskQueue,
  fakeCvSniffer,
  fakeTextExtractor,
  type InMemoryFileStorage,
  type InMemoryTaskQueue,
} from './in-memory-files.js';
import { createInMemoryJobRepository, createInMemoryOrganizationDirectory, type InMemoryJobRepository } from './in-memory-jobs.js';
import { createInMemoryPrivacyNoticeRepository } from './in-memory-privacy.js';
import { createInMemoryOutbox, type InMemoryOutbox } from './in-memory-automation.js';
import { createInMemoryMessageRepository, createMessagingStore, type MessagingStore } from './in-memory-messaging.js';
import { createInMemoryJobTeams, type InMemoryJobTeams } from './in-memory-job-teams.js';
import { createInMemoryTransaction } from './in-memory-transaction.js';

/** Everything the Phase 2 use cases may ask for, fully in memory, with a counter-based id generator and a fixed clock. */
export type TestCandidateDeps = CandidateDeps &
  PrivacyDeps &
  SubmitApplicationDeps &
  CvExtractionDeps &
  Pick<JobDeps, 'jobs' | 'organizations' | 'privacyNotices'> &
  Pick<ReportDeps, 'reports'> &
  Pick<RecordJobViewDeps, 'jobViews'> & {
    readonly auditLog: InMemoryAuditLog;
    readonly files: InMemoryFileStorage;
    readonly queue: InMemoryTaskQueue;
    readonly outbox: InMemoryOutbox;
    readonly store: CandidateStore;
    readonly messagingStore: MessagingStore;
    readonly jobTeams: InMemoryJobTeams;
    readonly jobs: InMemoryJobRepository;
  };

export function createTestCandidateDeps(overrides: Partial<TestCandidateDeps> = {}): TestCandidateDeps {
  let counter = 0;
  const store = overrides.store ?? createCandidateStore();
  const auditLog = overrides.auditLog ?? createInMemoryAuditLog();
  const messagingStore = overrides.messagingStore ?? createMessagingStore();
  const outbox = overrides.outbox ?? createInMemoryOutbox();
  const jobs = overrides.jobs ?? createInMemoryJobRepository();
  return {
    auditLog,
    store,
    transaction: createInMemoryTransaction(),
    jobTeams: createInMemoryJobTeams([], { store }),
    messagingStore,
    outbox,
    messages: createInMemoryMessageRepository(messagingStore),
    stageEvents: createInMemoryStageEvents(store),
    promises: createInMemoryResponsePromises(store),
    reports: createInMemoryReports(store),
    jobViews: createInMemoryJobViews(store),
    jobs,
    organizations: createInMemoryOrganizationDirectory(),
    privacyNotices: createInMemoryPrivacyNoticeRepository(),
    candidates: createInMemoryCandidateRepository(store),
    applications: createInMemoryApplicationRepository(store),
    notes: createInMemoryCandidateNoteRepository(store),
    extractions: createInMemoryCvExtractionRepository(store),
    candidateSearch: createInMemoryCandidateSearch(store),
    users: createInMemoryUserDirectory(),
    intake: createInMemoryApplicationIntake(store, auditLog, outbox, jobs),
    files: createInMemoryFileStorage(),
    queue: createInMemoryTaskQueue(),
    cvSniffer: fakeCvSniffer,
    textExtractor: fakeTextExtractor('Plain text of the CV'),
    modelExtractor: null,
    newId: () => {
      counter += 1;
      return `${String(counter).padStart(6, '0')}-id`;
    },
    now: () => new Date('2026-06-01T10:00:00.000Z'),
    ...overrides,
  };
}
