import { randomUUID } from 'node:crypto';
import {
  createDistributionRegistry,
  type DrizzleUnitOfWork,
  type DistributionChannel,
  type DistributionDeps,
  type TrackedLinkDeps,
} from '@candydati/core';

export interface DistributionInputs {
  readonly uow: DrizzleUnitOfWork;
  /** Public site URL (`PLATFORM_URL`). */
  readonly publicBaseUrl: string;
  /** Hosted deployments register their channels here; the self-hosted default is none. */
  readonly channels?: readonly DistributionChannel[] | undefined;
}

/** Distribution on Postgres. The registry is built (and validated) once, at startup. */
export function createDistributionDeps({ uow, publicBaseUrl, channels = [] }: DistributionInputs): DistributionDeps {
  const r = uow.repositories;
  return {
    auditLog: r.auditLog,
    transaction: uow.transaction,
    jobTeams: uow.repositories.jobTeams,
    jobs: r.jobs,
    organizations: r.organizations,
    distributions: r.distributions,
    distributionSettings: r.distributionSettings,
    registry: createDistributionRegistry(channels),
    publicBaseUrl,
    now: () => new Date(),
  };
}

/** Tracked links saved on jobs, on Postgres. */
export function createTrackedLinkDeps(uow: DrizzleUnitOfWork): TrackedLinkDeps {
  const r = uow.repositories;
  return { auditLog: r.auditLog, transaction: uow.transaction, jobTeams: r.jobTeams, jobs: r.jobs, trackedLinks: r.trackedLinks, newId: randomUUID, now: () => new Date() };
}
