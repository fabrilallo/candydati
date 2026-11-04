import { reportQuerySchema, type Job, type ReportsDto } from '@candydati/domain';
import { NotFoundError } from '../../errors.js';
import type { ReportDeps } from '../../report-ports.js';
import { buildReports } from './build-reports.js';
import { defineReportUseCase } from './define.js';
import { sequential } from '../../sequential.js';

/** The jobs of a client (an unknown client has none), or undefined without a client filter. */
async function clientJobIds(deps: ReportDeps, organizationId: string, clientId: string | undefined): Promise<readonly string[] | undefined> {
  if (clientId === undefined) return undefined;
  return deps.jobClients ? deps.jobClients.listJobIdsByClient(organizationId, clientId) : [];
}

/**
 * Published and closed jobs (drafts cannot have applications); narrowed to the client's jobs, then to `jobId`, when given.
 * A foreign or unknown job, or a job of another client, is "not found".
 */
async function loadJobs(deps: ReportDeps, organizationId: string, jobId: string | undefined, clientJobs: readonly string[] | undefined): Promise<readonly Job[]> {
  const [published, closed] = await sequential(() => deps.jobs.listByStatus(organizationId, 'published'), () => deps.jobs.listByStatus(organizationId, 'closed'));
  const jobs = [...published, ...closed].filter((job) => clientJobs === undefined || clientJobs.includes(job.id));
  if (jobId === undefined) return jobs;
  const found = jobs.filter((job) => job.id === jobId);
  if (found.length === 0) throw new NotFoundError('Job not found.');
  return found;
}

/**
 * Time to hire, time to fill, funnel, sources, response promises and outcome coverage for a period (PRODUCT.md §3.1). Numbers
 * only: no candidate data. The figures come from the stage events and promises kept since Phase 10 (older ones are rebuilt
 * best effort), and applications erased under GDPR are gone from them.
 */
export const getReports = defineReportUseCase({
  name: 'getReports',
  input: reportQuerySchema,
  permission: 'report:read',
  audit: { skip: 'read-only aggregates without personal data; auditing it would add an event on every view' },
  handler: async ({ deps, actor, input }): Promise<ReportsDto> => {
    const organizationId = actor.organizationId;
    const now = deps.now();
    const clientJobs = await clientJobIds(deps, organizationId, input.clientId);
    const jobs = await loadJobs(deps, organizationId, input.jobId, clientJobs);
    const aggregates = await deps.reports.aggregate({ organizationId, from: input.from, to: input.to, jobId: input.jobId, jobIds: clientJobs, now });
    return { ...buildReports({ aggregates, jobs, jobId: input.jobId ?? null, from: input.from, to: input.to, now }), clientId: input.clientId ?? null };
  },
});
