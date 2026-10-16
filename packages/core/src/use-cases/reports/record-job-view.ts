import { isBotUserAgent, jobViewQuerySchema, viewDay, viewLabels } from '@candydati/domain';
import { z } from 'zod';
import type { RecordJobViewDeps } from '../../job-view-ports.js';
import { definePublicCommand } from '../../use-case.js';

const input = jobViewQuerySchema.extend({
  organizationSlug: z.string().min(1),
  jobSlug: z.string().min(1),
  /** The `User-Agent` header, only to leave crawlers out. It is never stored. */
  userAgent: z.string().max(1000).optional(),
});

/**
 * One visit of the public page of a job, as sent by the beacon the page fires after it ran in a browser. Counts into the
 * daily aggregate `job_view_daily` (day, source, campaign): no cookie, no IP, no user agent kept, so two visits cannot be
 * told apart. Crawlers and headless browsers are left out; unknown organizations, unknown jobs and jobs that are not
 * published are ignored without a sign, so the route is no oracle. Not audited: it is a counter, not a decision.
 */
export const recordJobView = definePublicCommand<RecordJobViewDeps, typeof input, { readonly counted: boolean }>({
  name: 'recordJobView',
  input,
  actorId: 'careers_page',
  audit: { skip: 'a visit counter changes no data about a person; auditing every page view would flood the log' },
  transaction: { skip: 'a single atomic upsert' },
  handler: async ({ deps, input: visit }) => {
    if (isBotUserAgent(visit.userAgent)) return { counted: false };
    const organization = await deps.organizations.findBySlug(visit.organizationSlug);
    if (!organization) return { counted: false };
    const job = await deps.jobs.findPublishedBySlug(organization.id, visit.jobSlug);
    if (!job) return { counted: false };
    await deps.jobViews.increment({ organizationId: organization.id, jobId: job.id, day: viewDay(deps.now()), ...viewLabels(visit) });
    return { counted: true };
  },
});
