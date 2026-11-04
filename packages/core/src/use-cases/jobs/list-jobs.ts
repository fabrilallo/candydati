import { JOB_STATUSES, type ClientDisplay, type Job, type PageMeta } from '@candydati/domain';
import { z } from 'zod';
import type { JobDeps } from '../../job-ports.js';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '../list-audit-log.js';
import { defineJobUseCase } from './define.js';

const inputSchema = z.object({
  status: z.enum(JOB_STATUSES).optional(),
  /** Only the jobs of this client (PRODUCT.md §3.5). An unknown client has no jobs. */
  clientId: z.string().min(1).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
});

export interface JobListClient {
  readonly id: string;
  readonly name: string;
  readonly display: ClientDisplay;
}

export interface JobPageResult {
  readonly items: readonly Job[];
  readonly meta: PageMeta;
  /** The client of each listed job that has one, by job id. */
  readonly clients: Readonly<Record<string, JobListClient>>;
}

async function clientsOf(deps: JobDeps, organizationId: string, jobs: readonly Job[]): Promise<Readonly<Record<string, JobListClient>>> {
  if (!deps.jobClients || !deps.clients || jobs.length === 0) return {};
  const links = await deps.jobClients.listByJobs(organizationId, jobs.map((job) => job.id));
  if (links.length === 0) return {};
  const clients = await deps.clients.list(organizationId, { includeArchived: true });
  const entries = links.flatMap((link) => {
    const client = clients.find((c) => c.id === link.clientId);
    return client ? [[link.jobId, { id: client.id, name: client.name, display: link.display }] as const] : [];
  });
  return Object.fromEntries(entries);
}

export const listJobs = defineJobUseCase({
  name: 'listJobs',
  input: inputSchema,
  permission: 'job:read',
  audit: { skip: 'read-only; auditing reads would add an event on every page view' },
  handler: async ({ deps, actor, input }): Promise<JobPageResult> => {
    const { organizationId } = actor;
    const { clientId, ...query } = input;
    const jobIds = clientId === undefined ? undefined : deps.jobClients ? await deps.jobClients.listJobIdsByClient(organizationId, clientId) : [];
    const { items, total } = await deps.jobs.list({ ...query, organizationId, jobIds });
    return { items, meta: { total, page: input.page, limit: input.limit }, clients: await clientsOf(deps, organizationId, items) };
  },
});
