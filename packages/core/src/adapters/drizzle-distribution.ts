import { and, eq, schema } from '@tt/db';
import type { DistributionSetting, JobDistribution } from '@tt/domain';
import type { DistributionSettingRepository, JobDistributionRepository } from '../distribution-ports.js';
import type { DbExecutor } from './db-executor.js';

export function createDrizzleJobDistributions(db: DbExecutor): JobDistributionRepository {
  const { jobDistribution } = schema;
  const key = (organizationId: string, jobId: string) => and(eq(jobDistribution.organizationId, organizationId), eq(jobDistribution.jobId, jobId));
  return {
    async listByJob(organizationId, jobId) {
      return db.select().from(jobDistribution).where(key(organizationId, jobId)).orderBy(jobDistribution.channelId);
    },
    async find(organizationId, jobId, channelId) {
      const [row] = await db.select().from(jobDistribution).where(and(key(organizationId, jobId), eq(jobDistribution.channelId, channelId))).limit(1);
      return row ?? null;
    },
    async save(distribution: JobDistribution) {
      const { status, externalId, url, error, updatedAt } = distribution;
      await db
        .insert(jobDistribution)
        .values(distribution)
        .onConflictDoUpdate({ target: [jobDistribution.organizationId, jobDistribution.jobId, jobDistribution.channelId], set: { status, externalId, url, error, updatedAt } });
      return distribution;
    },
  };
}

export function createDrizzleDistributionSettings(db: DbExecutor): DistributionSettingRepository {
  const { distributionSetting } = schema;
  return {
    list: (organizationId) => db.select().from(distributionSetting).where(eq(distributionSetting.organizationId, organizationId)).orderBy(distributionSetting.channelId),
    async save(setting: DistributionSetting) {
      await db
        .insert(distributionSetting)
        .values(setting)
        .onConflictDoUpdate({ target: [distributionSetting.organizationId, distributionSetting.channelId], set: { enabled: setting.enabled, updatedAt: setting.updatedAt } });
      return setting;
    },
  };
}
