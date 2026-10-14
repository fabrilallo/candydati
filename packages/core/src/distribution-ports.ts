import type { DistributionJobView, DistributionSetting, JobDistribution, PublicOrganizationDto } from '@tt/domain';
import type { PublicJobDeps, JobRepository, OrganizationDirectory } from './job-ports.js';
import type { CoreDeps } from './ports.js';

/** What a channel answers after it took an ad. Both are optional: not every channel has ids or pages. */
export interface DistributionChannelResult {
  readonly externalId?: string | undefined;
  readonly url?: string | undefined;
}

/** What the channel already knows about the ad (from the previous sync). */
export interface DistributionPrevious {
  readonly externalId: string | null;
  readonly url: string | null;
}

/** What `remove` needs: the ad is closed, so there is no content to send, only the way to find it. */
export interface DistributionRemoval extends DistributionPrevious {
  readonly jobId: string;
  readonly slug: string;
}

/**
 * A place an ad can be sent to besides the built-in XML feed (a job board). Registered per deployment: the self-hosted
 * distribution registers none, a hosted one registers its own. `update` must be safe to repeat: a retry re-sends.
 * A thrown error means "not delivered": the sync records it as `failed` and retries; keep the message short, it is shown.
 */
export interface DistributionChannel {
  /** Stable, lowercase (`CHANNEL_ID_PATTERN`), never `feed`. */
  readonly id: string;
  readonly label: string;
  publish(job: DistributionJobView, organization: PublicOrganizationDto): Promise<DistributionChannelResult>;
  update(job: DistributionJobView, organization: PublicOrganizationDto, previous: DistributionPrevious): Promise<DistributionChannelResult>;
  remove(removal: DistributionRemoval, organization: PublicOrganizationDto): Promise<void>;
}

export interface DistributionRegistry {
  /** In registration order. */
  list(): readonly DistributionChannel[];
  get(channelId: string): DistributionChannel | null;
}

export interface JobDistributionRepository {
  /** Every channel row of one job. */
  listByJob(organizationId: string, jobId: string): Promise<readonly JobDistribution[]>;
  find(organizationId: string, jobId: string, channelId: string): Promise<JobDistribution | null>;
  /** Insert or replace by (organizationId, jobId, channelId). */
  save(distribution: JobDistribution): Promise<JobDistribution>;
}

export interface DistributionSettingRepository {
  list(organizationId: string): Promise<readonly DistributionSetting[]>;
  /** Insert or replace by (organizationId, channelId). */
  save(setting: DistributionSetting): Promise<DistributionSetting>;
}

export interface DistributionDeps extends CoreDeps {
  readonly jobs: JobRepository;
  readonly organizations: OrganizationDirectory;
  readonly distributions: JobDistributionRepository;
  readonly distributionSettings: DistributionSettingRepository;
  readonly registry: DistributionRegistry;
  /** Public site URL (`PLATFORM_URL`): the feed and the ad pages live under it. */
  readonly publicBaseUrl: string;
  readonly now: () => Date;
}

/** The public reads that build links need the base URL on top of the job reads. */
export type PublicSiteDeps = PublicJobDeps & { readonly publicBaseUrl: string };
