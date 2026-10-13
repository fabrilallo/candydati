import { STATS_WEEKS, type JobStatsDto } from '@tt/domain';
import { z } from 'zod';
import { defineJobUseCase } from './define.js';
import { buildProcess, buildQuality, buildReadiness, buildSalary, buildStatusCounts } from './job-stats.js';
import { fillWeeks, firstWeekStart, weekStarts } from './job-stats-weeks.js';

/** Overview of the actor's organization job ads. Every figure is computed from stored ads. */
export const getJobStats = defineJobUseCase({
  name: 'getJobStats',
  input: z.object({}),
  permission: 'job:read',
  audit: { skip: 'read-only aggregate; auditing it would add an event on every dashboard view' },
  handler: async ({ deps, actor }): Promise<JobStatsDto> => {
    const now = deps.now();
    const organizationId = actor.organizationId;
    const [counts, activity, drafts, published] = await Promise.all([
      deps.jobs.countByStatus(organizationId),
      deps.jobs.weeklyActivity(organizationId, firstWeekStart(now, STATS_WEEKS)),
      deps.jobs.listByStatus(organizationId, 'draft'),
      deps.jobs.listByStatus(organizationId, 'published'),
    ]);
    return {
      generatedAt: now.toISOString(),
      statusCounts: buildStatusCounts(counts),
      weekly: fillWeeks(weekStarts(now, STATS_WEEKS), activity),
      quality: buildQuality(published, deps.adQualityThreshold),
      salary: buildSalary(published),
      process: buildProcess(published),
      readiness: buildReadiness(drafts),
    };
  },
});
