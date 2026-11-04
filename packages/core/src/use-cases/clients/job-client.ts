import { jobClientInputSchema, type ClientDisplay, type JobClientLink } from '@candydati/domain';
import { z } from 'zod';
import type { ClientDeps } from '../../client-ports.js';
import { ConflictError, NotFoundError } from '../../errors.js';
import { defineClientUseCase, requireAgency } from './define.js';
import { requireClient } from './clients.js';

export interface JobClientView {
  readonly jobId: string;
  readonly client: { readonly id: string; readonly name: string; readonly archived: boolean } | null;
  readonly display: ClientDisplay;
}

const NONE = (jobId: string): JobClientView => ({ jobId, client: null, display: 'named' });

async function requireJob(deps: Pick<ClientDeps, 'jobs'>, organizationId: string, jobId: string): Promise<void> {
  if (!(await deps.jobs.findById(organizationId, jobId))) throw new NotFoundError('Job not found.');
}

export async function jobClientView(deps: Pick<ClientDeps, 'clients' | 'jobClients'>, organizationId: string, jobId: string): Promise<JobClientView> {
  const link = await deps.jobClients.findByJob(organizationId, jobId);
  if (!link) return NONE(jobId);
  const client = await deps.clients.findById(organizationId, link.clientId);
  if (!client) return NONE(jobId);
  return { jobId, client: { id: client.id, name: client.name, archived: client.archivedAt !== null }, display: link.display };
}

/** The client of a job, or none. Same access as the job: a job outside one's scope is not found. */
export const getJobClient = defineClientUseCase({
  name: 'getJobClient',
  input: z.object({ jobId: z.string().min(1) }),
  permission: 'job:read',
  audit: { skip: 'read-only' },
  handler: async ({ deps, actor, input }): Promise<JobClientView> => {
    await requireJob(deps, actor.organizationId, input.jobId);
    return jobClientView(deps, actor.organizationId, input.jobId);
  },
});

/**
 * Links a job to a client, choosing how the ad shows it: by name, or as a confidential client of the agency.
 * `clientId: null` takes the job away from its client. It needs `client:manage`, which no API key or assistant can hold:
 * naming a confidential client on a public ad is a person's decision. The job must be reachable (per-job scope).
 */
export const setJobClient = defineClientUseCase({
  name: 'setJobClient',
  input: jobClientInputSchema.extend({ jobId: z.string().min(1) }),
  permission: 'client:manage',
  audit: {
    action: 'job.client_updated',
    target: (input) => ({ type: 'job', id: input.jobId }),
    metadata: (_input, result: JobClientView) => ({ clientId: result.client?.id ?? null, display: result.display }),
  },
  handler: async ({ deps, actor, input }): Promise<JobClientView> => {
    const { organizationId } = actor;
    await requireJob(deps, organizationId, input.jobId);
    if (input.clientId === null) {
      await deps.jobClients.remove(organizationId, input.jobId);
      return NONE(input.jobId);
    }
    await requireAgency(deps, organizationId);
    const client = await requireClient(deps, organizationId, input.clientId);
    const current = await deps.jobClients.findByJob(organizationId, input.jobId);
    // An archived client keeps the jobs it has, but gets no new one.
    if (client.archivedAt !== null && current?.clientId !== client.id) throw new ConflictError('client_archived');
    const link: JobClientLink = {
      organizationId,
      jobId: input.jobId,
      clientId: client.id,
      display: input.display,
      updatedBy: actor.onBehalfOfUserId ?? actor.id ?? 'system',
      updatedAt: deps.now(),
    };
    await deps.jobClients.set(link);
    return { jobId: input.jobId, client: { id: client.id, name: client.name, archived: client.archivedAt !== null }, display: link.display };
  },
});
