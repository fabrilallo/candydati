import type { JobClientRepository, ShortlistRepository } from '../client-ports.js';
import { NotFoundError } from '../errors.js';
import type { JobScopeContext } from './job-scope.js';

/**
 * The client of a job and the shortlists of a job follow the job (PRODUCT.md §6.2). Clients themselves are organization
 * data, readable by every member. The token lookup and the cross-organization scan pass through: they never run for a
 * scoped actor.
 */
export function scopeJobClients(raw: JobClientRepository, ctx: JobScopeContext): JobClientRepository {
  const inScope = async (jobIds: readonly string[]): Promise<readonly string[]> => {
    const allowed = await ctx.jobIds();
    return allowed === null ? jobIds : jobIds.filter((id) => allowed.includes(id));
  };
  return {
    ...raw,
    findByJob: async (organizationId, jobId) => ((await ctx.allowsJob(jobId)) ? raw.findByJob(organizationId, jobId) : null),
    listByJobs: async (organizationId, jobIds) => raw.listByJobs(organizationId, await inScope(jobIds)),
    listJobIdsByClient: async (organizationId, clientId) => inScope(await raw.listJobIdsByClient(organizationId, clientId)),
    async countByClient(organizationId) {
      const allowed = await ctx.jobIds();
      if (allowed === null) return raw.countByClient(organizationId);
      const counts: Record<string, number> = {};
      for (const link of await raw.listByJobs(organizationId, allowed)) counts[link.clientId] = (counts[link.clientId] ?? 0) + 1;
      return counts;
    },
    async set(link) {
      if (!(await ctx.allowsJob(link.jobId))) throw new NotFoundError('Job not found.');
      return raw.set(link);
    },
    async remove(organizationId, jobId) {
      if (!(await ctx.allowsJob(jobId))) throw new NotFoundError('Job not found.');
      return raw.remove(organizationId, jobId);
    },
  };
}

export function scopeShortlists(raw: ShortlistRepository, ctx: JobScopeContext): ShortlistRepository {
  return {
    ...raw,
    async create(shortlist, items) {
      if (!(await ctx.allowsJob(shortlist.jobId))) throw new NotFoundError('Job not found.');
      return raw.create(shortlist, items);
    },
    async findById(organizationId, id) {
      const shortlist = await raw.findById(organizationId, id);
      return shortlist && (await ctx.allowsJob(shortlist.jobId)) ? shortlist : null;
    },
    listByJob: async (organizationId, jobId) => ((await ctx.allowsJob(jobId)) ? raw.listByJob(organizationId, jobId) : []),
    listItemsByApplication: async (organizationId, applicationId) =>
      (await ctx.applicationsIn([applicationId])).length > 0 ? raw.listItemsByApplication(organizationId, applicationId) : [],
  };
}
