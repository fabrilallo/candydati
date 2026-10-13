import {
  createDistributionRegistry,
  createDrizzleAuditLog,
  createDrizzleDistributionSettings,
  createDrizzleJobDistributions,
  createDrizzleJobs,
  createDrizzleOrganizationDirectory,
  type DistributionChannel,
  type DistributionDeps,
} from '@tt/core';
import type { Db } from '@tt/db';
import type { PlatformConfig } from '@tt/domain';

export interface DistributionWiring {
  readonly db: Db;
  readonly platform: PlatformConfig;
  /** Channels beyond the built-in feed. The open source distribution registers none; a hosted one passes its own. */
  readonly channels?: readonly DistributionChannel[] | undefined;
}

export function createDistributionWorkerDeps({ db, platform, channels = [] }: DistributionWiring): DistributionDeps {
  return {
    auditLog: createDrizzleAuditLog(db),
    jobs: createDrizzleJobs(db),
    organizations: createDrizzleOrganizationDirectory(db),
    distributions: createDrizzleJobDistributions(db),
    distributionSettings: createDrizzleDistributionSettings(db),
    registry: createDistributionRegistry(channels),
    publicBaseUrl: platform.url,
    now: () => new Date(),
  };
}
