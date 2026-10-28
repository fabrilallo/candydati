import { jobTrafficQuerySchema, type JobTrafficDto, type TrafficRow } from '@candydati/domain';
import type { DailyTraffic } from '../../report-ports.js';
import { requireJob } from '../jobs/shared.js';
import { defineReportUseCase } from './define.js';

const keyOf = (row: { readonly day: string; readonly origin: string; readonly campaign: string }): string => `${row.day}\u0000${row.origin}\u0000${row.campaign}`;

/** One row per day, source and campaign with either figure; by day, then most applications, then source and campaign. */
export function mergeTraffic(traffic: DailyTraffic): readonly TrafficRow[] {
  const rows = new Map<string, TrafficRow>();
  for (const { day, origin, campaign, visits } of traffic.visits) rows.set(keyOf({ day, origin, campaign }), { day, origin, campaign, visits, applications: 0 });
  for (const { day, origin, campaign, applications } of traffic.applications) {
    const key = keyOf({ day, origin, campaign });
    rows.set(key, { day, origin, campaign, visits: rows.get(key)?.visits ?? 0, applications });
  }
  return [...rows.values()].toSorted(
    (a, b) => a.day.localeCompare(b.day) || b.applications - a.applications || a.origin.localeCompare(b.origin) || a.campaign.localeCompare(b.campaign),
  );
}

/**
 * Visits and applications of one job day by day, per source and campaign (the chart of the Distribution tab). Counts
 * only: no candidate data, nothing per visitor. The same permission as the sources of the reports; a job the actor does
 * not reach is "not found".
 */
export const getJobTraffic = defineReportUseCase({
  name: 'getJobTraffic',
  input: jobTrafficQuerySchema,
  permission: 'report:read',
  audit: { skip: 'read-only daily counts without personal data; auditing it would add an event on every view' },
  handler: async ({ deps, actor, input }): Promise<JobTrafficDto> => {
    const job = await requireJob(deps, actor.organizationId, input.jobId);
    const traffic = await deps.reports.dailyTraffic({ organizationId: actor.organizationId, jobId: job.id, from: input.from, to: input.to });
    return { jobId: job.id, from: input.from.toISOString(), to: input.to.toISOString(), rows: [...mergeTraffic(traffic)] };
  },
});
