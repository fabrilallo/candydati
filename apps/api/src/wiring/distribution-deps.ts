import {
  createDistributionRegistry,
  createDrizzleDistributionSettings,
  createDrizzleJobDistributions,
  createDrizzleJobs,
  createDrizzleOrganizationDirectory,
  type AuditLogRepository,
  type DistributionChannel,
  type DistributionDeps,
} from '@tt/core';
import type { Db } from '@tt/db';

export interface DistributionInputs {
  readonly db: Db;
  readonly auditLog: AuditLogRepository;
  /** Public site URL (`PLATFORM_URL`). */
  readonly publicBaseUrl: string;
  /** Hosted deployments register their channels here; the open source default is none. */
  readonly channels?: readonly DistributionChannel[] | undefined;
}

/** Distribution on Postgres. The registry is built (and validated) once, at startup. */
export function createDistributionDeps({ db, auditLog, publicBaseUrl, channels = [] }: DistributionInputs): DistributionDeps {
  return {
    auditLog,
    jobs: createDrizzleJobs(db),
    organizations: createDrizzleOrganizationDirectory(db),
    distributions: createDrizzleJobDistributions(db),
    distributionSettings: createDrizzleDistributionSettings(db),
    registry: createDistributionRegistry(channels),
    publicBaseUrl,
    now: () => new Date(),
  };
}
