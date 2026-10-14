import type { DataExport, RetentionRun } from '@tt/domain';
import type { ConfiguredProviders, CandidateRightsDeps, OrganizationExportDeps, PrivacyOverviewDeps, RetentionDeps } from '../privacy-ports.js';
import type { FeedbackRecords, StageInterviewerRepository } from '../feedback-ports.js';
import { seedAutomationWorld, type AutomationSeedOptions, type TestAutomationDeps } from './automation-deps.js';
import {
  createFeedbackStore,
  createInMemoryFeedbackRequests,
  createInMemoryInterviewFeedback,
  createInMemoryStageInterviewers,
  type FeedbackStore,
} from './in-memory-feedback.js';
import {
  createFakeZipFactory,
  createInMemoryDataExports,
  createInMemoryErasure,
  createInMemoryRetentionRuns,
  type InMemoryDataExports,
  type InMemoryRetentionRuns,
} from './in-memory-privacy-ops.js';

export const testProviders: ConfiguredProviders = { storage: 'local', email: 'smtp', model: 'openai/gpt-test' };

export type TestPrivacyDeps = TestAutomationDeps &
  CandidateRightsDeps &
  OrganizationExportDeps &
  RetentionDeps &
  PrivacyOverviewDeps &
  FeedbackRecords & {
    readonly feedbackStore: FeedbackStore;
    readonly stageInterviewers: StageInterviewerRepository;
    readonly retentionRuns: InMemoryRetentionRuns;
    readonly dataExports: InMemoryDataExports;
    readonly zip: ReturnType<typeof createFakeZipFactory>;
  };

export interface PrivacySeedOptions extends AutomationSeedOptions {
  readonly retentionRuns?: readonly RetentionRun[];
  readonly dataExports?: readonly DataExport[];
  readonly privacyOverrides?: Partial<TestPrivacyDeps>;
}

/** The automation world (`org_a`) plus erasure, retention runs, data exports, a fake ZIP writer and configured providers. */
export function seedPrivacyWorld(options: PrivacySeedOptions = {}): TestPrivacyDeps {
  const world = seedAutomationWorld(options);
  const feedbackStore = createFeedbackStore();
  const dataExports = createInMemoryDataExports(options.dataExports);
  return {
    ...world,
    feedbackStore,
    jobTeams: world.jobTeams.withSources({ interviewers: feedbackStore }),
    stageInterviewers: createInMemoryStageInterviewers(feedbackStore),
    feedbackRequests: createInMemoryFeedbackRequests(feedbackStore),
    interviewFeedback: createInMemoryInterviewFeedback(feedbackStore),
    erasure: createInMemoryErasure({ ...world, feedbackStore, dataExports }),
    retentionRuns: createInMemoryRetentionRuns(options.retentionRuns),
    dataExports,
    zip: createFakeZipFactory(),
    providers: testProviders,
    ...options.privacyOverrides,
  };
}
