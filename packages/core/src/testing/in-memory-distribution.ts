import type { DistributionSetting, JobDistribution } from '@candydati/domain';
import type {
  DistributionChannel,
  DistributionChannelResult,
  DistributionPrevious,
  DistributionRemoval,
  DistributionSettingRepository,
  JobDistributionRepository,
} from '../distribution-ports.js';
import { cell } from './in-memory-transaction.js';

export interface InMemoryJobDistributions extends JobDistributionRepository {
  snapshot(): readonly JobDistribution[];
}

export function createInMemoryJobDistributions(initial: readonly JobDistribution[] = []): InMemoryJobDistributions {
  const rows = cell<readonly JobDistribution[]>([...initial]);
  const same = (a: JobDistribution, b: Pick<JobDistribution, 'organizationId' | 'jobId' | 'channelId'>) =>
    a.organizationId === b.organizationId && a.jobId === b.jobId && a.channelId === b.channelId;
  return {
    async listByJob(organizationId, jobId) {
      return rows.get().filter((row) => row.organizationId === organizationId && row.jobId === jobId).toSorted((a, b) => a.channelId.localeCompare(b.channelId));
    },
    async find(organizationId, jobId, channelId) {
      return rows.get().find((row) => same(row, { organizationId, jobId, channelId })) ?? null;
    },
    async save(distribution) {
      rows.set([...rows.get().filter((row) => !same(row, distribution)), distribution]);
      return distribution;
    },
    snapshot: () => rows.get(),
  };
}

export interface InMemoryDistributionSettings extends DistributionSettingRepository {
  snapshot(): readonly DistributionSetting[];
}

export function createInMemoryDistributionSettings(initial: readonly DistributionSetting[] = []): InMemoryDistributionSettings {
  const rows = cell<readonly DistributionSetting[]>([...initial]);
  return {
    async list(organizationId) {
      return rows.get().filter((row) => row.organizationId === organizationId);
    },
    async save(setting) {
      rows.set([...rows.get().filter((row) => !(row.organizationId === setting.organizationId && row.channelId === setting.channelId)), setting]);
      return setting;
    },
    snapshot: () => rows.get(),
  };
}

export type FakeChannelCall =
  | { readonly kind: 'publish'; readonly jobId: string; readonly slug: string }
  | { readonly kind: 'update'; readonly jobId: string; readonly slug: string; readonly previous: DistributionPrevious }
  | { readonly kind: 'remove'; readonly removal: DistributionRemoval };

export interface FakeDistributionChannel extends DistributionChannel {
  calls(): readonly FakeChannelCall[];
  /** The next calls fail with this message (all of them, until `succeed()`). */
  fail(message: string): void;
  succeed(): void;
}

/**
 * A channel that answers `ext-<slug>` / `https://board.test/<slug>` and records every call. The only distribution
 * channel in the repository: production registers none.
 */
export function createFakeDistributionChannel(id = 'fake-board', label = 'Fake board'): FakeDistributionChannel {
  let calls: readonly FakeChannelCall[] = [];
  let failure: string | null = null;
  const guard = (): void => {
    if (failure !== null) throw new Error(failure);
  };
  const result = (slug: string): DistributionChannelResult => ({ externalId: `ext-${slug}`, url: `https://board.test/${slug}` });
  return {
    id,
    label,
    async publish(job) {
      calls = [...calls, { kind: 'publish', jobId: job.id, slug: job.slug }];
      guard();
      return result(job.slug);
    },
    async update(job, _organization, previous) {
      calls = [...calls, { kind: 'update', jobId: job.id, slug: job.slug, previous }];
      guard();
      return result(job.slug);
    },
    async remove(removal) {
      calls = [...calls, { kind: 'remove', removal }];
      guard();
    },
    calls: () => calls,
    fail(message) {
      failure = message;
    },
    succeed() {
      failure = null;
    },
  };
}
