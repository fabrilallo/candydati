import type { DistributionDeps } from '../distribution-ports.js';
import { createDistributionRegistry } from '../distribution-registry.js';
import type { WebhookPublishDeps } from '../webhook-ports.js';
import { createInMemoryWebhookEndpoints, type InMemoryWebhookEndpoints } from './in-memory-automation.js';
import { createInMemoryDistributionSettings, createInMemoryJobDistributions, createFakeDistributionChannel, type FakeDistributionChannel, type InMemoryDistributionSettings, type InMemoryJobDistributions } from './in-memory-distribution.js';
import { createInMemoryTaskQueue, type InMemoryTaskQueue } from './in-memory-files.js';
import { createInMemoryJobRepository, createInMemoryOrganizationDirectory } from './in-memory-jobs.js';
import { createTestJobDeps, type TestJobDeps } from './job-deps.js';

export type TestDistributionDeps = TestJobDeps &
  DistributionDeps &
  WebhookPublishDeps & {
    readonly distributions: InMemoryJobDistributions;
    readonly distributionSettings: InMemoryDistributionSettings;
    readonly endpoints: InMemoryWebhookEndpoints;
    readonly queue: InMemoryTaskQueue;
    readonly channel: FakeDistributionChannel;
    /** Moves the clock the deps read. */
    setNow(date: Date): void;
  };

export const DISTRIBUTION_ORG = 'org_a';
export const DISTRIBUTION_BASE_URL = 'https://jobs.example.com';

/**
 * The job world plus the distribution ports in memory: one organization (`org_a`, slug `acme`), the fake channel
 * registered (pass `channels: []` for the empty registry of the self-hosted default), a recording queue and a
 * clock you can move with `setNow`.
 */
export function createTestDistributionDeps(overrides: Partial<TestDistributionDeps> & { channels?: readonly FakeDistributionChannel[] } = {}): TestDistributionDeps {
  const { channels, ...rest } = overrides;
  const channel = channels?.[0] ?? createFakeDistributionChannel();
  let current = new Date('2026-06-01T10:00:00.000Z');
  const base = createTestJobDeps({
    organizations: createInMemoryOrganizationDirectory([{ id: DISTRIBUTION_ORG, name: 'Acme', slug: 'acme', logo: null }]),
    jobs: createInMemoryJobRepository(),
    now: () => current,
  });
  return {
    ...base,
    distributions: createInMemoryJobDistributions(),
    distributionSettings: createInMemoryDistributionSettings(),
    registry: createDistributionRegistry(channels ?? [channel]),
    publicBaseUrl: DISTRIBUTION_BASE_URL,
    endpoints: createInMemoryWebhookEndpoints(),
    queue: createInMemoryTaskQueue(),
    channel,
    setNow: (date) => {
      current = date;
    },
    ...rest,
  };
}
