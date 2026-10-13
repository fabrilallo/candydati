import {
  createDistributionRegistry,
  type DrizzleUnitOfWork,
  type DistributionChannel,
  type DistributionDeps,
} from '@tt/core';

export interface DistributionInputs {
  readonly uow: DrizzleUnitOfWork;
  /** Public site URL (`PLATFORM_URL`). */
  readonly publicBaseUrl: string;
  /** Hosted deployments register their channels here; the open source default is none. */
  readonly channels?: readonly DistributionChannel[] | undefined;
}

/** Distribution on Postgres. The registry is built (and validated) once, at startup. */
export function createDistributionDeps({ uow, publicBaseUrl, channels = [] }: DistributionInputs): DistributionDeps {
  const r = uow.repositories;
  return {
    auditLog: r.auditLog,
    transaction: uow.transaction,
    jobs: r.jobs,
    organizations: r.organizations,
    distributions: r.distributions,
    distributionSettings: r.distributionSettings,
    registry: createDistributionRegistry(channels),
    publicBaseUrl,
    now: () => new Date(),
  };
}
