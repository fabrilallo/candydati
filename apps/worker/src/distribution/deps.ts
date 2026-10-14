import {
  createDistributionRegistry,
  type DrizzleUnitOfWork,
  type DistributionChannel,
  type DistributionDeps,
} from '@tt/core';
import type { PlatformConfig } from '@tt/domain';

export interface DistributionWiring {
  readonly uow: DrizzleUnitOfWork;
  readonly platform: PlatformConfig;
  /** Channels beyond the built-in feed. The self-hosted default registers none; a hosted one passes its own. */
  readonly channels?: readonly DistributionChannel[] | undefined;
}

export function createDistributionWorkerDeps({ uow, platform, channels = [] }: DistributionWiring): DistributionDeps {
  const r = uow.repositories;
  return {
    auditLog: r.auditLog,
    transaction: uow.transaction,
    jobs: r.jobs,
    organizations: r.organizations,
    distributions: r.distributions,
    distributionSettings: r.distributionSettings,
    registry: createDistributionRegistry(channels),
    publicBaseUrl: platform.url,
    now: () => new Date(),
  };
}
