import { daysSince, staleCutoff, staleJobDedupeKey, type Notification } from '@tt/domain';
import { z } from 'zod';
import type { StaleScanDeps } from '../../job-request-ports.js';
import { defineSystemJob } from '../../use-case.js';
import { buildDigests, OrganizationContext, type DeadlineScanResult } from '../automations/scan-deadlines.js';

/**
 * Part of the hourly scan. Tells the owner of each published ad that went 90 days without activity (the owner left: owners
 * and admins). One notification per (user, ad, period): the period is identified by the last activity, so the same quiet
 * stretch is reported once and a new one, after fresh activity, is reported again. Never closes anything. Returns the new
 * notifications as digests, like the deadline scan.
 */
export const scanStaleJobs = defineSystemJob<StaleScanDeps, z.ZodObject<{ now: z.ZodDate }>, DeadlineScanResult>({
  name: 'scanStaleJobs',
  input: z.object({ now: z.date() }),
  handler: async ({ deps, input }): Promise<DeadlineScanResult> => {
    const { now } = input;
    const created: Notification[] = [];
    const contexts = new Map<string, OrganizationContext>();
    const context = (organizationId: string): OrganizationContext => {
      let found = contexts.get(organizationId);
      if (!found) {
        found = new OrganizationContext(deps, organizationId);
        contexts.set(organizationId, found);
      }
      return found;
    };
    for (const { job, lastActivityAt } of await deps.staleJobs.listStale(staleCutoff(now))) {
      for (const member of await context(job.organizationId).owners(job)) {
        const stored = await deps.notifications.createIfAbsent(
          {
            id: deps.newId(),
            organizationId: job.organizationId,
            userId: member.userId,
            kind: 'job_stale',
            applicationId: null,
            jobId: job.id,
            taskId: null,
            payload: { daysIdle: daysSince(lastActivityAt, now), lastActivityAt: lastActivityAt.toISOString() },
            createdAt: now,
            readAt: null,
          },
          staleJobDedupeKey(job.id, lastActivityAt),
        );
        if (stored) created.push(stored);
      }
    }
    return { digests: await buildDigests(context, created) };
  },
});
