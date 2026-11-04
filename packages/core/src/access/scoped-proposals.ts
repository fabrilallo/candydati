import { NotFoundError } from '../errors.js';
import type { MoveProposalRepository } from '../proposal-ports.js';
import type { JobScopeContext } from './job-scope.js';

/** Move proposals follow their job: someone who cannot open the job neither sees nor acts on its proposals. */
export function scopeMoveProposals(raw: MoveProposalRepository, ctx: JobScopeContext): MoveProposalRepository {
  const guard = async (jobId: string): Promise<void> => {
    if (!(await ctx.allowsJob(jobId))) throw new NotFoundError('Proposal not found.');
  };
  return {
    ...raw,
    async createIfNoneOpen(proposal) {
      await guard(proposal.jobId);
      return raw.createIfNoneOpen(proposal);
    },
    async findById(organizationId, id) {
      const proposal = await raw.findById(organizationId, id);
      return proposal && (await ctx.allowsJob(proposal.jobId)) ? proposal : null;
    },
    async listOpen(query) {
      const jobIds = await ctx.jobIds();
      return raw.listOpen(jobIds === null ? query : { ...query, jobIds: query.jobIds ? query.jobIds.filter((id) => jobIds.includes(id)) : jobIds });
    },
    async resolve(organizationId, id, resolution) {
      const proposal = await raw.findById(organizationId, id);
      if (!proposal) return null;
      await guard(proposal.jobId);
      return raw.resolve(organizationId, id, resolution);
    },
    async dropOpenForApplication(organizationId, applicationId, at) {
      if ((await ctx.applicationsIn([applicationId])).length === 0) return 0;
      return raw.dropOpenForApplication(organizationId, applicationId, at);
    },
  };
}
