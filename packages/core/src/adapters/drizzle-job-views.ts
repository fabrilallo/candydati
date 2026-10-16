import { lt, schema, sql } from '@candydati/db';
import type { JobViewRepository } from '../job-view-ports.js';
import type { DbExecutor } from './db-executor.js';

const { jobViewDaily } = schema;

export function createDrizzleJobViews(db: DbExecutor): JobViewRepository {
  return {
    async increment(key, by = 1) {
      await db
        .insert(jobViewDaily)
        .values({ organizationId: key.organizationId, jobId: key.jobId, day: key.day, source: key.source, campaign: key.campaign, views: by })
        .onConflictDoUpdate({
          target: [jobViewDaily.organizationId, jobViewDaily.jobId, jobViewDaily.day, jobViewDaily.source, jobViewDaily.campaign],
          set: { views: sql`${jobViewDaily.views} + ${by}` },
        });
    },
    async purgeBefore(day) {
      const deleted = await db.delete(jobViewDaily).where(lt(jobViewDaily.day, day)).returning({ day: jobViewDaily.day });
      return deleted.length;
    },
  };
}
