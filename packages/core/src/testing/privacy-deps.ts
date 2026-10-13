import type { DataExport, RetentionRun } from '@tt/domain';
import type { ConfiguredProviders, CandidateRightsDeps, OrganizationExportDeps, PrivacyOverviewDeps, RetentionDeps } from '../privacy-ports.js';
import { seedAutomationWorld, type AutomationSeedOptions, type TestAutomationDeps } from './automation-deps.js';
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
  PrivacyOverviewDeps & {
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
  return {
    ...world,
    erasure: createInMemoryErasure(world),
    retentionRuns: createInMemoryRetentionRuns(options.retentionRuns),
    dataExports: createInMemoryDataExports(options.dataExports),
    zip: createFakeZipFactory(),
    providers: testProviders,
    ...options.privacyOverrides,
  };
}
