import { and, count, eq, isNull, schema } from '@candydati/db';
import type { OpenApplicationCounts } from '../job-ports.js';
import type { DbExecutor } from './db-executor.js';

/** Postgres implementation. Filters by `organization_id` like every other statement. */
export function createDrizzleApplicationCounts(db: DbExecutor): OpenApplicationCounts {
  const { application } = schema;
  return {
    async openByStage(organizationId, jobId) {
      const rows = await db
        .select({ stageId: application.stageId, total: count() })
        .from(application)
        .where(and(eq(application.organizationId, organizationId), eq(application.jobId, jobId), isNull(application.outcome)))
        .groupBy(application.stageId);
      return Object.fromEntries(rows.map((row) => [row.stageId, row.total]));
    },
  };
}
